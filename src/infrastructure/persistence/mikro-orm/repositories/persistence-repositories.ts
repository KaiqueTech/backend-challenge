import type { EntityManager } from '@mikro-orm/postgresql';
import { LockMode } from '@mikro-orm/core';
import { WalletEntity } from '../entities/wallet.entity.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';
import type { WalletRepository as WalletRepositoryPort } from '../../../../domain/interfaces/wallet.repository.js';
import type { WagerTransactionRepository as WagerTransactionRepositoryPort } from '../../../../domain/interfaces/wager-transaction.repository.js';
import { LedgerEntryEntity } from '../entities/ledger-entry.entity.js';

export class WalletRepository implements WalletRepositoryPort<EntityManager, WalletEntity> {
  async findForUpdate(em: EntityManager, id: string): Promise<WalletEntity | null> {
    return em.findOne(WalletEntity, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE });
  }

  async findById(em: EntityManager, id: string): Promise<WalletEntity | null> {
    return em.findOne(WalletEntity, { id });
  }

  async findLedger(em: EntityManager, walletId: string, cursor?: { createdAt: Date; id: string }, limit = 51): Promise<LedgerEntryEntity[]> {
    const where = cursor
      ? { walletId, $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { $lt: cursor.id } }] }
      : { walletId };
    return em.find(LedgerEntryEntity, where, { orderBy: { createdAt: 'desc', id: 'desc' }, limit });
  }
}

export class WagerTransactionRepository implements WagerTransactionRepositoryPort<EntityManager, WagerTransactionEntity> {
  async findByIdempotency(em: EntityManager, providerId: string, idempotencyKey: string): Promise<WagerTransactionEntity | null> {
    return em.findOne(WagerTransactionEntity, { providerId, idempotencyKey });
  }

  async findByExternalId(em: EntityManager, providerId: string, externalTransactionId: string): Promise<WagerTransactionEntity | null> {
    return em.findOne(WagerTransactionEntity, { providerId, externalTransactionId });
  }

  async findById(em: EntityManager, id: string): Promise<WagerTransactionEntity | null> {
    return em.findOne(WagerTransactionEntity, { id });
  }

  async findReversal(em: EntityManager, providerId: string, referenceTransactionId: string, type: string): Promise<WagerTransactionEntity | null> {
    return em.findOne(WagerTransactionEntity, { providerId, referenceTransactionId, type });
  }
}