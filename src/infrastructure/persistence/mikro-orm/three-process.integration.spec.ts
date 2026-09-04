import { spawn } from 'node:child_process';
import { MikroORM } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import config from '../../../mikro-orm.config.js';
import { Money } from '../../../domain/entities/money/money.js';
import { WageringPersistenceService } from './wagering-persistence.service.js';
import { WalletRepository, WagerTransactionRepository } from './repositories/persistence-repositories.js';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;

function runProcess(item: { id: string; walletId: string; playerId: string; amount: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.BUN_BINARY ?? 'bun', ['run', 'scripts/process-wager.ts', JSON.stringify(item)], {
      cwd: process.cwd(),
      env: { ...process.env, SQS_CONSUMER_ENABLED: 'false', SQS_PUBLISHER_ENABLED: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let errorOutput = '';
    child.stdout.resume();
    child.stderr.on('data', (chunk: Buffer) => { errorOutput += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`worker exited with ${code}: ${errorOutput}`));
      else resolve();
    });
  });
}

integration('separate process concurrency', () => {
  it('keeps one wallet consistent across three OS processes', async () => {
    const orm = await MikroORM.init(config);
    const walletId = `three-process-${Date.now()}`;
    const playerId = `three-process-player-${Date.now()}`;
    try {
      await orm.migrator.up();
      await orm.em.getConnection().execute('truncate table ledger_entries, outbox_messages, inbox_messages, wager_transactions, wallets restart identity cascade');
      const setup = new WageringPersistenceService(orm.em.fork(), new WalletRepository(), new WagerTransactionRepository());
      await setup.createWallet({ id: walletId, playerId, initialBalance: Money.create('30.00', 'BRL') });
      const results = await Promise.all(Array.from({ length: 3 }, (_, index) => runProcess({
        id: `three-process-bet-${index}`,
        walletId,
        playerId,
        amount: '10.00',
      })));
      expect(results).toHaveLength(3);
      const rows = await orm.em.getConnection().execute<{ balance: string; debit_count: string }[]>(
        `select w.balance, (select count(*) from ledger_entries where wallet_id = w.id and type = 'DEBIT') as debit_count from wallets w where w.id = ?`,
        [walletId],
      );
      expect(rows[0]).toMatchObject({ balance: '0.00', debit_count: '3' });
    } finally {
      await orm.close(true);
    }
  }, 30_000);
});
