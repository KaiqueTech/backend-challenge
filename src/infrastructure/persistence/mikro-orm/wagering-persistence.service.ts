import { Injectable, Optional } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EntityManager as MikroEntityManager } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { LedgerEntryMapper } from './mappers/ledger-entry.mapper.js';
import { WalletMapper } from './mappers/wallet.mapper.js';
import { WagerTransactionMapper } from './mappers/wager-transaction.mapper.js';
import { Wallet } from '../../../domain/entities/wallet/wallet.js';
import { Money } from '../../../domain/entities/money/money.js';
import { WagerTransaction, WagerTransactionKind, WagerTransactionStatus } from '../../../domain/entities/wagering/wager-transaction.js';
import { WagerTransactionProcessor } from '../../../domain/entities/wagering/wager-transaction-processor.js';
import { WalletRepository, WagerTransactionRepository } from './repositories/persistence-repositories.js';
import type { WageringOperations } from '../../../application/ports/wagering-operations.port.js';
import { InboxMessageEntity } from './entities/inbox-message.entity.js';
import { OutboxMessageEntity } from './entities/outbox-message.entity.js';
import { WagerTransactionEntity } from './entities/wager-transaction.entity.js';
import { transactionEvent, walletBalanceChangedEvent } from '../../../application/events/integration-events.js';
import { WalletLedgerEntry, LedgerDirection } from '../../../domain/entities/ledger/ledger-entry.js';
import type { LedgerPage, ReconciliationResult } from '../../../application/ports/wagering-operations.port.js';
import { MetricsService } from '../../observability/metrics.service.js';
import { StructuredLogger, errorMessage } from '../../observability/structured-logger.js';

@Injectable()
export class WageringPersistenceService implements WageringOperations {
  private readonly logger = new StructuredLogger(WageringPersistenceService.name);
  private readonly metrics: MetricsService;

  constructor(
    @Inject(MikroEntityManager)
    private readonly em: EntityManager,
    private readonly wallets: WalletRepository,
    private readonly transactions: WagerTransactionRepository,
    @Optional() metrics?: MetricsService,
  ) {
    this.metrics = metrics ?? new MetricsService();
  }

  async createWallet(props: { id: string; playerId: string; initialBalance: Money }): Promise<Wallet> {
    const wallet = Wallet.open(props);
    await this.em.transactional(async (em) => {
      const walletEntity = WalletMapper.toEntity(wallet);
      em.persist(walletEntity);
      if (props.initialBalance.isPositive()) {
        await em.flush();
        const now = new Date();
        const opening = WagerTransaction.rehydrate({
          id: `${wallet.id}:opening`,
          providerId: 'SYSTEM',
          externalTransactionId: `${wallet.id}:opening`,
          idempotencyKey: `${wallet.id}:opening`,
          payloadHash: `${wallet.id}:opening:${wallet.balance.toString()}`,
          walletId: wallet.id,
          playerId: wallet.playerId,
          roundId: 'SYSTEM',
          kind: WagerTransactionKind.Opening,
          money: props.initialBalance,
          status: WagerTransactionStatus.Processed,
          processedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        const openingEntry = WalletLedgerEntry.create({
          id: `${opening.id}:ledger`,
          walletId: wallet.id,
          transactionId: opening.id,
          direction: LedgerDirection.Credit,
          money: props.initialBalance,
          balanceBefore: Money.zero(props.initialBalance.currency),
          balanceAfter: props.initialBalance,
          createdAt: now,
        });
        em.persist(WagerTransactionMapper.toEntity(opening));
        await em.flush();
        em.persist(LedgerEntryMapper.toEntity(openingEntry));
        this.enqueueOutbox(em, transactionEvent(opening, 'WagerTransactionProcessed'));
        this.enqueueOutbox(em, walletBalanceChangedEvent(wallet, openingEntry, opening));
        this.metrics.transactionStatus(opening.status);
      }
    });
    return wallet;
  }

  async process(transaction: WagerTransaction): Promise<WagerTransaction> {
    const startedAt = Date.now();
    try {
      const result = await this.em.transactional(async (em) => this.processInTransaction(em, transaction, true));
      this.metrics.transactionStatus(result.status);
      this.logger.log('wager_transaction_processed', {
        transactionId: result.id,
        walletId: result.walletId,
        providerId: result.providerId,
        status: result.status,
      });
      return result;
    } catch (error) {
      if (this.isLockConflict(error)) {
        this.metrics.lockConflict();
        this.logger.error('wallet_lock_conflict', {
          transactionId: transaction.id,
          walletId: transaction.walletId,
          providerId: transaction.providerId,
          error: errorMessage(error),
        });
      }
      if (this.isUniqueViolation(error)) {
        this.metrics.duplicateDetected();
        const existing = await this.transactions.findByIdempotency(this.em, transaction.providerId, transaction.idempotencyKey);
        if (existing) {
          const persisted = WagerTransactionMapper.toDomain(existing);
          if (!persisted.matchesPayload(transaction.payloadHash)) throw new Error('IDEMPOTENCY_CONFLICT');
          this.metrics.transactionStatus(persisted.status);
          return persisted;
        }
      }
      throw error;
    } finally {
      this.metrics.processingLatency(Date.now() - startedAt);
    }
  }

  async findWallet(walletId: string): Promise<Wallet | null> {
    const entity = await this.wallets.findById(this.em, walletId);
    return entity ? WalletMapper.toDomain(entity) : null;
  }

  async listLedger(walletId: string, cursor?: string, limit = 50): Promise<LedgerPage> {
    const decoded = cursor ? this.decodeCursor(cursor) : undefined;
    const entries = await this.wallets.findLedger(this.em, walletId, decoded, limit + 1);
    const page = entries.slice(0, limit);
    return {
      items: page.map((entry) => ({ id: entry.id, transactionId: entry.transactionId, type: entry.type, amount: entry.amount, currency: entry.currency, balanceBefore: entry.balanceBefore, balanceAfter: entry.balanceAfter, createdAt: entry.createdAt.toISOString() })),
      nextCursor: entries.length > limit ? this.encodeCursor(page[page.length - 1]) : undefined,
    };
  }

  async findTransaction(transactionId: string): Promise<WagerTransaction | null> {
    const entity = await this.transactions.findById(this.em, transactionId);
    return entity ? WagerTransactionMapper.toDomain(entity) : null;
  }

  async findTransactionByExternal(providerId: string, externalTransactionId: string): Promise<WagerTransaction | null> {
    const entity = await this.transactions.findByExternalId(this.em, providerId, externalTransactionId);
    return entity ? WagerTransactionMapper.toDomain(entity) : null;
  }

  async reconcile(walletId: string): Promise<ReconciliationResult | null> {
    const wallet = await this.findWallet(walletId);
    if (!wallet) return null;
    const rows = await this.em.getConnection().execute<{ balance: string; currency: string; count: string }[]>(
      `select coalesce(sum(case when type = 'CREDIT' then amount else -amount end), 0) as balance, max(currency) as currency, count(*) as count from ledger_entries where wallet_id = ?`,
      [walletId],
    );
    const calculatedBalance = Money.create(rows[0]?.balance ?? '0.00', wallet.currency);
    const consistent = wallet.balance.equals(calculatedBalance);
    if (!consistent) {
      this.metrics.increment('wager_reconciliation_inconsistencies_total');
      this.logger.error('wallet_reconciliation_inconsistent', {
        walletId,
        checkedEntries: Number(rows[0]?.count ?? 0),
      });
    }
    return { walletId, storedBalance: wallet.balance, calculatedBalance, difference: wallet.balance.subtract(calculatedBalance), consistent, checkedEntries: Number(rows[0]?.count ?? 0) };
  }

  private encodeCursor(entry: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ createdAt: entry.createdAt.toISOString(), id: entry.id }), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor: string): { createdAt: Date; id: string } {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt: string; id: string };
      const createdAt = new Date(parsed.createdAt);
      if (!parsed.id || Number.isNaN(createdAt.getTime())) throw new Error();
      return { createdAt, id: parsed.id };
    } catch {
      throw new Error('INVALID_CURSOR');
    }
  }

  async processMessage(messageId: string, transaction: WagerTransaction, consumerName = 'wager-transaction-consumer'): Promise<WagerTransaction> {
    const startedAt = Date.now();
    try {
      const result = await this.em.transactional(async (em) => {
      const inserted = await em.getConnection().execute<{ id: string }[]>(
        `insert into inbox_messages (id, consumer_name, message_id, received_at, status, retry_count) values (?, ?, ?, now(), 'RECEIVED', 0) on conflict (consumer_name, message_id) do nothing returning id`,
        [`${consumerName}:${messageId}`, consumerName, messageId],
      );
      if (inserted.length === 0) {
        this.metrics.duplicateDetected();
        this.logger.warn('inbox_duplicate_detected', { messageId, transactionId: transaction.id, walletId: transaction.walletId, providerId: transaction.providerId });
        const existing = await em.findOne(InboxMessageEntity, { consumerName, messageId });
        if (existing?.status === 'PROCESSED') {
          const persisted = await this.transactions.findByIdempotency(em, transaction.providerId, transaction.idempotencyKey);
          if (!persisted) throw new Error('Inbox is processed but transaction is missing');
          const original = WagerTransactionMapper.toDomain(persisted);
          if (!original.matchesPayload(transaction.payloadHash)) throw new Error('IDEMPOTENCY_CONFLICT');
          return original;
        }
      }

      const existingTransaction = await this.transactions.findByIdempotency(em, transaction.providerId, transaction.idempotencyKey);
      const result = await this.processInTransaction(em, transaction, !existingTransaction);
      const inbox = await em.findOneOrFail(InboxMessageEntity, { consumerName, messageId });
      inbox.status = 'PROCESSED';
      inbox.processedAt = new Date();
      em.persist(inbox);
      return result;
      });
      this.metrics.transactionStatus(result.status);
      this.logger.log('wager_message_processed', {
        messageId,
        transactionId: result.id,
        walletId: result.walletId,
        providerId: result.providerId,
        status: result.status,
      });
      return result;
    } catch (error) {
      if (this.isLockConflict(error)) {
        this.metrics.lockConflict();
        this.logger.error('wallet_lock_conflict', {
          messageId,
          transactionId: transaction.id,
          walletId: transaction.walletId,
          providerId: transaction.providerId,
          error: errorMessage(error),
        });
      }
      throw error;
    } finally {
      this.metrics.processingLatency(Date.now() - startedAt);
    }
  }

  async reprocessPendingReferences(limit = 50, policy: { maxAttempts?: number; ttlMs?: number } = {}): Promise<number> {
    const maxAttempts = Math.max(1, policy.maxAttempts ?? 10);
    const ttlMs = Math.max(0, policy.ttlMs ?? 24 * 60 * 60 * 1000);
    return this.em.transactional(async (em) => {
      const rows = await em.getConnection().execute<{ id: string; pendingReferenceAttempts: number; pendingReferenceSince: Date | null }[]>(
        `select id, pending_reference_attempts as "pendingReferenceAttempts", pending_reference_since as "pendingReferenceSince" from wager_transactions where status = 'PENDING_REFERENCE' order by created_at for update skip locked limit ?`,
        [limit],
      );
      for (const row of rows) {
        this.metrics.retry('pending_reference');
        const entity = await em.findOneOrFail(WagerTransactionEntity, { id: row.id });
        const transaction = WagerTransactionMapper.toDomain(entity);
        await this.processInTransaction(em, transaction, true, true, {
          maxAttempts,
          ttlMs,
          attempts: Number(row.pendingReferenceAttempts ?? entity.pendingReferenceAttempts ?? 0) + 1,
          since: row.pendingReferenceSince ? new Date(row.pendingReferenceSince) : entity.pendingReferenceSince ?? entity.createdAt,
        });
      }
      return rows.length;
    });
  }

  private async processInTransaction(
    em: EntityManager,
    transaction: WagerTransaction,
    enqueueEvents = false,
    retryPendingReference = false,
    pendingPolicy?: { maxAttempts: number; ttlMs: number; attempts: number; since: Date },
  ): Promise<WagerTransaction> {
    const previousStatus = transaction.status;
    const existing = await this.transactions.findByIdempotency(em, transaction.providerId, transaction.idempotencyKey);
    const existingByExternal = await this.transactions.findByExternalId(
      em,
      transaction.providerId,
      transaction.externalTransactionId,
    );
    const persistedEntity = existing ?? existingByExternal;
    if (persistedEntity && (!retryPendingReference || persistedEntity.status !== 'PENDING_REFERENCE')) {
      this.metrics.duplicateDetected();
      this.logger.warn('wager_duplicate_detected', {
        transactionId: transaction.id,
        walletId: transaction.walletId,
        providerId: transaction.providerId,
      });
      const persisted = WagerTransactionMapper.toDomain(persistedEntity);
      if (!persisted.matchesPayload(transaction.payloadHash)) throw new Error('IDEMPOTENCY_CONFLICT');
      return persisted;
    }

    const walletEntity = await this.wallets.findForUpdate(em, transaction.walletId);
    if (!walletEntity) throw new Error('Wallet not found');
    const wallet = WalletMapper.toDomain(walletEntity);
    const referenceEntity = transaction.referenceExternalTransactionId
      ? await this.transactions.findByExternalId(em, transaction.providerId, transaction.referenceExternalTransactionId)
      : null;

    if (retryPendingReference && pendingPolicy && !referenceEntity &&
        (pendingPolicy.attempts >= pendingPolicy.maxAttempts ||
          Date.now() - pendingPolicy.since.getTime() >= pendingPolicy.ttlMs)) {
      transaction.fail('REFERENCE_NOT_FOUND');
    }

    if (transaction.status !== WagerTransactionStatus.Failed &&
        referenceEntity && (transaction.kind === WagerTransactionKind.Refund || transaction.kind === WagerTransactionKind.Rollback)) {
      const duplicate = await this.transactions.findReversal(em, transaction.providerId, referenceEntity.id, transaction.kind);
      if (duplicate) {
        transaction.reject('DUPLICATE_REVERSAL');
      }
    }

    const ledger = transaction.status === 'REJECTED' || transaction.status === WagerTransactionStatus.Failed
      ? undefined
      : WagerTransactionProcessor.process(transaction, wallet, {
        reference: referenceEntity ? WagerTransactionMapper.toDomain(referenceEntity) : undefined,
      });

    const persisted = WagerTransactionMapper.toEntity(transaction, persistedEntity ?? undefined);
    em.persist(persisted);
    if (transaction.status === WagerTransactionStatus.PendingReference) {
      persisted.pendingReferenceAttempts = pendingPolicy?.attempts ?? persisted.pendingReferenceAttempts ?? 0;
      persisted.pendingReferenceSince = persisted.pendingReferenceSince ?? pendingPolicy?.since ?? new Date();
    } else {
      persisted.pendingReferenceAttempts = 0;
      persisted.pendingReferenceSince = null;
    }
    await em.flush();
    if (ledger) em.persist(LedgerEntryMapper.toEntity(ledger));
    WalletMapper.toEntity(wallet, walletEntity);
    if (enqueueEvents && (!retryPendingReference || previousStatus !== transaction.status || ledger)) {
      const event = transaction.status === 'REJECTED'
        ? transactionEvent(transaction, 'WagerTransactionRejected')
        : transaction.status === WagerTransactionStatus.Failed
          ? transactionEvent(transaction, 'WagerTransactionFailed')
        : transaction.status === 'PENDING_REFERENCE'
          ? transactionEvent(transaction, 'WagerTransactionPendingReference')
          : transactionEvent(transaction, 'WagerTransactionProcessed');
      this.enqueueOutbox(em, event);
      if (ledger) this.enqueueOutbox(em, walletBalanceChangedEvent(wallet, ledger, transaction));
    }
    return transaction;
  }

  private enqueueOutbox(em: EntityManager, event: ReturnType<typeof transactionEvent>): void {
    const outbox = new OutboxMessageEntity();
    outbox.id = event.eventId;
    outbox.eventType = event.eventType;
    outbox.eventVersion = event.version;
    outbox.aggregateType = event.eventType.startsWith('Wallet') ? 'Wallet' : 'WagerTransaction';
    outbox.aggregateId = event.aggregateId;
    outbox.payload = event as unknown as Record<string, unknown>;
    outbox.occurredAt = new Date(event.occurredAt);
    outbox.status = 'PENDING';
    outbox.attempts = 0;
    outbox.createdAt = new Date();
    em.persist(outbox);
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
  }

  private isLockConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error.code === '55P03' || error.code === '40P01');
  }
}