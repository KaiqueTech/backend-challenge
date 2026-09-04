import { MikroORM } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import config from '../../../mikro-orm.config.js';
import { Money } from '../../../domain/entities/money/money.js';
import { WagerTransaction, WagerTransactionKind } from '../../../domain/entities/wagering/wager-transaction.js';
import { WageringPersistenceService } from './wagering-persistence.service.js';
import { WalletRepository, WagerTransactionRepository } from './repositories/persistence-repositories.js';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;

integration('financial persistence', () => {
  async function cleanWallet(orm: MikroORM, walletId: string): Promise<void> {
    const connection = orm.em.getConnection();
    void walletId;
    await connection.execute('truncate table ledger_entries, outbox_messages, inbox_messages, wager_transactions, wallets restart identity cascade');
  }

  function bet(id: string, walletId: string, playerId: string, amount: string, key = id): WagerTransaction {
    return WagerTransaction.create({
      id, providerId: 'integration-provider', externalTransactionId: id, idempotencyKey: key,
      payloadHash: `hash-${key}`, walletId, playerId, roundId: 'integration-round',
      kind: WagerTransactionKind.Bet, money: Money.create(amount, 'BRL'),
    });
  }

  function refund(id: string, walletId: string, playerId: string, reference: string): WagerTransaction {
    return WagerTransaction.create({
      id, providerId: 'integration-provider', externalTransactionId: id, idempotencyKey: id,
      payloadHash: `hash-${id}`, walletId, playerId, roundId: 'integration-round',
      kind: WagerTransactionKind.Refund, money: Money.create('80.00', 'BRL'), referenceExternalTransactionId: reference,
    });
  }

  it('persists one of two concurrent bets and one ledger entry', async () => {
    const orm = await MikroORM.init(config);
    await orm.migrator.up();
    await cleanWallet(orm, 'integration-wallet');
    const em = orm.em.fork();
    const service = new WageringPersistenceService(em, new WalletRepository(), new WagerTransactionRepository());
    await service.createWallet({ id: 'integration-wallet', playerId: 'integration-player', initialBalance: Money.create('100.00', 'BRL') });

    const makeBet = (id: string) => WagerTransaction.create({
      id, providerId: 'integration-provider', externalTransactionId: id, idempotencyKey: id,
      payloadHash: `hash-${id}`, walletId: 'integration-wallet', playerId: 'integration-player',
      roundId: 'integration-round', kind: WagerTransactionKind.Bet, money: Money.create('80.00', 'BRL'),
    });
    const results = await Promise.all([service.process(makeBet('bet-a')), service.process(makeBet('bet-b'))]);
    expect(results.filter((result) => result.status === 'PROCESSED')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'REJECTED')).toHaveLength(1);

    const row = await em.getConnection().execute<{ balance: string; ledger_count: string; debit_count: string }>(
      `select w.balance, (select count(*) from ledger_entries where wallet_id = w.id) as ledger_count, (select count(*) from ledger_entries where wallet_id = w.id and type = 'DEBIT') as debit_count from wallets w where w.id = 'integration-wallet'`,
    );
    expect(row[0].balance).toBe('20.00');
    expect(row[0].ledger_count).toBe('2');
    expect(row[0].debit_count).toBe('1');
    await orm.close(true);
  });

  it('processes exactly ten of fifty concurrent bets', async () => {
    const orm = await MikroORM.init(config);
    await orm.migrator.up();
    await cleanWallet(orm, 'integration-many-wallets');
    const em = orm.em.fork();
    const service = new WageringPersistenceService(em, new WalletRepository(), new WagerTransactionRepository());
    await service.createWallet({ id: 'integration-many-wallets', playerId: 'integration-many-player', initialBalance: Money.create('100.00', 'BRL') });

    const results = await Promise.all(Array.from({ length: 50 }, (_, index) => service.process(bet(`many-bet-${index}`, 'integration-many-wallets', 'integration-many-player', '10.00'))));
    expect(results.filter((result) => result.status === 'PROCESSED')).toHaveLength(10);
    expect(results.filter((result) => result.status === 'REJECTED')).toHaveLength(40);
    const row = await em.getConnection().execute<{ balance: string; debit_count: string }[]>(
      `select w.balance, (select count(*) from ledger_entries where wallet_id = w.id and type = 'DEBIT') as debit_count from wallets w where w.id = 'integration-many-wallets'`,
    );
    expect(row[0].balance).toBe('0.00');
    expect(row[0].debit_count).toBe('10');
    await cleanWallet(orm, 'integration-many-wallets');
    await orm.close(true);
  });

  it('keeps the wallet consistent across three independent ORM instances', async () => {
    const orms = await Promise.all([MikroORM.init(config), MikroORM.init(config), MikroORM.init(config)]);
    const primary = orms[0];
    await primary.migrator.up();
    await cleanWallet(primary, 'integration-three-instances-wallet');
    const setup = new WageringPersistenceService(primary.em.fork(), new WalletRepository(), new WagerTransactionRepository());
    await setup.createWallet({ id: 'integration-three-instances-wallet', playerId: 'integration-three-instances-player', initialBalance: Money.create('30.00', 'BRL') });
    const services = orms.map((orm) => new WageringPersistenceService(orm.em.fork(), new WalletRepository(), new WagerTransactionRepository()));

    const results = await Promise.all(Array.from({ length: 30 }, (_, index) =>
      services[index % services.length].process(bet(`three-instance-bet-${index}`, 'integration-three-instances-wallet', 'integration-three-instances-player', '1.00')),
    ));

    expect(results.filter((result) => result.status === 'PROCESSED')).toHaveLength(30);
    const row = await primary.em.getConnection().execute<{ balance: string; debit_count: string }[]>(
      `select w.balance, (select count(*) from ledger_entries where wallet_id = w.id and type = 'DEBIT') as debit_count from wallets w where w.id = 'integration-three-instances-wallet'`,
    );
    expect(row[0]).toMatchObject({ balance: '0.00', debit_count: '30' });
    await cleanWallet(primary, 'integration-three-instances-wallet');
    await Promise.all(orms.map((orm) => orm.close(true)));
  });

  it('processes one financial effect for fifty duplicate requests', async () => {
    const orm = await MikroORM.init(config);
    await orm.migrator.up();
    await cleanWallet(orm, 'integration-duplicate-wallet');
    const em = orm.em.fork();
    const service = new WageringPersistenceService(em, new WalletRepository(), new WagerTransactionRepository());
    await service.createWallet({ id: 'integration-duplicate-wallet', playerId: 'integration-duplicate-player', initialBalance: Money.create('100.00', 'BRL') });

    const results = await Promise.all(Array.from({ length: 50 }, (_, index) => service.process(bet(`duplicate-bet-${index}`, 'integration-duplicate-wallet', 'integration-duplicate-player', '80.00', 'same-idempotency-key'))));
    const rows = await em.getConnection().execute<{ balance: string; transaction_count: string; debit_count: string }[]>(
      `select w.balance, (select count(*) from wager_transactions where wallet_id = w.id and type = 'BET') as transaction_count, (select count(*) from ledger_entries where wallet_id = w.id and type = 'DEBIT') as debit_count from wallets w where w.id = 'integration-duplicate-wallet'`,
    );
    expect(results.filter((result) => result.status === 'PROCESSED')).toHaveLength(50);
    expect(rows[0].balance).toBe('20.00');
    expect(rows[0].transaction_count).toBe('1');
    expect(rows[0].debit_count).toBe('1');
    await cleanWallet(orm, 'integration-duplicate-wallet');
    await orm.close(true);
  });

  it('deduplicates redelivery through persistent inbox and keeps outbox atomic', async () => {
    const orm = await MikroORM.init(config);
    await orm.migrator.up();
    await cleanWallet(orm, 'integration-inbox-wallet');
    const em = orm.em.fork();
    const service = new WageringPersistenceService(em, new WalletRepository(), new WagerTransactionRepository());
    await service.createWallet({ id: 'integration-inbox-wallet', playerId: 'integration-inbox-player', initialBalance: Money.create('100.00', 'BRL') });
    const transaction = bet('inbox-bet', 'integration-inbox-wallet', 'integration-inbox-player', '80.00', 'inbox-key');

    const first = await service.processMessage('message-1', transaction);
    const redelivery = await service.processMessage('message-1', bet('different-id', 'integration-inbox-wallet', 'integration-inbox-player', '80.00', 'inbox-key'));
    const rows = await em.getConnection().execute<{ inbox_count: string; processed_inbox: string; debit_count: string; outbox_count: string; balance: string }[]>(
      `select (select count(*) from inbox_messages where consumer_name = 'wager-transaction-consumer' and message_id = 'message-1') as inbox_count, (select count(*) from inbox_messages where consumer_name = 'wager-transaction-consumer' and message_id = 'message-1' and status = 'PROCESSED') as processed_inbox, (select count(*) from ledger_entries where wallet_id = 'integration-inbox-wallet' and type = 'DEBIT') as debit_count, (select count(*) from outbox_messages where payload->'data'->>'walletId' = 'integration-inbox-wallet') as outbox_count, (select balance from wallets where id = 'integration-inbox-wallet') as balance`,
    );
    expect(first.id).toBe(redelivery.id);
    expect(rows[0]).toMatchObject({ inbox_count: '1', processed_inbox: '1', debit_count: '1', outbox_count: '4', balance: '20.00' });
    await cleanWallet(orm, 'integration-inbox-wallet');
    await orm.close(true);
  });

  it('rejects ledger updates and deletes', async () => {
    const orm = await MikroORM.init(config);
    await orm.migrator.up();
    await cleanWallet(orm, 'integration-immutable-wallet');
    const em = orm.em.fork();
    const service = new WageringPersistenceService(em, new WalletRepository(), new WagerTransactionRepository());
    await service.createWallet({ id: 'integration-immutable-wallet', playerId: 'integration-immutable-player', initialBalance: Money.create('10.00', 'BRL') });
    const entry = await em.getConnection().execute<{ id: string }[]>(`select id from ledger_entries where wallet_id = 'integration-immutable-wallet' limit 1`);
    expect(entry).toHaveLength(1);
    await expect(em.getConnection().execute(`update ledger_entries set amount = '9.00' where id = ?`, [entry[0].id])).rejects.toThrow('append-only');
    await expect(em.getConnection().execute(`delete from ledger_entries where id = ?`, [entry[0].id])).rejects.toThrow('append-only');
    await cleanWallet(orm, 'integration-immutable-wallet');
    await orm.close(true);
  });

  it('reprocesses a pending refund after its bet arrives', async () => {
    const orm = await MikroORM.init(config);
    await orm.migrator.up();
    await cleanWallet(orm, 'integration-pending-wallet');
    const em = orm.em.fork();
    const service = new WageringPersistenceService(em, new WalletRepository(), new WagerTransactionRepository());
    await service.createWallet({ id: 'integration-pending-wallet', playerId: 'integration-pending-player', initialBalance: Money.create('100.00', 'BRL') });

    const pending = await service.process(refund('pending-refund', 'integration-pending-wallet', 'integration-pending-player', 'late-bet'));
    expect(pending.status).toBe('PENDING_REFERENCE');
    await service.process(bet('late-bet', 'integration-pending-wallet', 'integration-pending-player', '80.00'));
    expect(await service.reprocessPendingReferences()).toBe(1);
    const transaction = await service.findTransaction('pending-refund');
    const result = await service.reconcile('integration-pending-wallet');
    expect(transaction?.status).toBe('PROCESSED');
    expect(result).toMatchObject({ consistent: true, checkedEntries: 3 });
    expect(result?.storedBalance.toString()).toBe('100.00');
    await cleanWallet(orm, 'integration-pending-wallet');
    await orm.close(true);
  });

  it('moves an unresolved pending reference to a terminal failed state', async () => {
    const orm = await MikroORM.init(config);
    await orm.migrator.up();
    await cleanWallet(orm, 'integration-pending-expiry-wallet');
    const em = orm.em.fork();
    const service = new WageringPersistenceService(em, new WalletRepository(), new WagerTransactionRepository());
    await service.createWallet({ id: 'integration-pending-expiry-wallet', playerId: 'integration-pending-expiry-player', initialBalance: Money.create('100.00', 'BRL') });

    const pending = await service.process(refund('expiring-refund', 'integration-pending-expiry-wallet', 'integration-pending-expiry-player', 'never-arrives'));
    expect(pending.status).toBe('PENDING_REFERENCE');
    expect(await service.reprocessPendingReferences(50, { maxAttempts: 1, ttlMs: 60_000 })).toBe(1);

    const transaction = await service.findTransaction('expiring-refund');
    const events = await em.getConnection().execute<{ event_type: string; status: string }[]>(
      `select event_type, status from outbox_messages where payload->'data'->>'transactionId' = 'expiring-refund' order by created_at`,
    );
    expect(transaction).toMatchObject({ status: 'FAILED', failureCode: 'REFERENCE_NOT_FOUND' });
    expect(events.some((event) => event.event_type === 'WagerTransactionFailed' && event.status === 'PENDING')).toBe(true);
    await cleanWallet(orm, 'integration-pending-expiry-wallet');
    await orm.close(true);
  });
});