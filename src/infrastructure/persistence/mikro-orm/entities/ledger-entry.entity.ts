import { EntitySchema } from '@mikro-orm/core';

export class LedgerEntryEntity {
  id!: string;
  walletId!: string;
  transactionId!: string;
  type!: string;
  amount!: string;
  balanceBefore!: string;
  balanceAfter!: string;
  currency!: string;
  createdAt!: Date;
}

export const LedgerEntrySchema = new EntitySchema({
  class: LedgerEntryEntity,
  tableName: 'ledger_entries',
  properties: {
    id: { type: String, primary: true }, walletId: { type: String, fieldName: 'wallet_id' }, transactionId: { type: String, fieldName: 'transaction_id' }, type: { type: String }, amount: { type: 'numeric', precision: 20, scale: 2 },
    balanceBefore: { type: 'numeric', precision: 20, scale: 2, fieldName: 'balance_before' }, balanceAfter: { type: 'numeric', precision: 20, scale: 2, fieldName: 'balance_after' }, currency: { type: String, length: 3 }, createdAt: { type: Date, fieldName: 'created_at' },
  },
  uniques: [{ name: 'uq_ledger_transaction_wallet', properties: ['transactionId', 'walletId'] }],
});