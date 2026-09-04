import 'dotenv/config';

import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { WalletSchema } from './infrastructure/persistence/mikro-orm/entities/wallet.entity.js';
import { WagerTransactionSchema } from './infrastructure/persistence/mikro-orm/entities/wager-transaction.entity.js';
import { LedgerEntrySchema } from './infrastructure/persistence/mikro-orm/entities/ledger-entry.entity.js';
import { InboxMessageSchema } from './infrastructure/persistence/mikro-orm/entities/inbox-message.entity.js';
import { OutboxMessageSchema } from './infrastructure/persistence/mikro-orm/entities/outbox-message.entity.js';

export default defineConfig({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  dbName: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,

  entities: [WalletSchema, WagerTransactionSchema, LedgerEntrySchema, InboxMessageSchema, OutboxMessageSchema],

  discovery: {
    warnWhenNoEntities: false,
  },

  extensions: [Migrator],

  migrations: {
    path: './dist/infrastructure/persistence/database/migrations',
    pathTs: './src/infrastructure/persistence/database/migrations',
  },
});