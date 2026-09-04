import { MikroORM } from '@mikro-orm/postgresql';
import config from '../src/mikro-orm.config.js';
import { Money } from '../src/domain/entities/money/money.js';
import { WagerTransaction, WagerTransactionKind } from '../src/domain/entities/wagering/wager-transaction.js';
import { WageringPersistenceService } from '../src/infrastructure/persistence/mikro-orm/wagering-persistence.service.js';
import { WalletRepository, WagerTransactionRepository } from '../src/infrastructure/persistence/mikro-orm/repositories/persistence-repositories.js';

interface WorkItem {
  id: string;
  walletId: string;
  playerId: string;
  amount: string;
}

const item = JSON.parse(process.argv[2] ?? '') as WorkItem;
const orm = await MikroORM.init(config);
try {
  const service = new WageringPersistenceService(
    orm.em.fork(),
    new WalletRepository(),
    new WagerTransactionRepository(),
  );
  const transaction = WagerTransaction.create({
    id: item.id,
    providerId: 'three-process-provider',
    externalTransactionId: item.id,
    idempotencyKey: item.id,
    payloadHash: `hash-${item.id}`,
    walletId: item.walletId,
    playerId: item.playerId,
    roundId: 'three-process-round',
    kind: WagerTransactionKind.Bet,
    money: Money.create(item.amount, 'BRL'),
  });
  const result = await service.process(transaction);
  process.stdout.write(JSON.stringify({ id: result.id, status: result.status }));
} finally {
  await orm.close(true);
}
