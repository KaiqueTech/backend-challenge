import { EntitySchema } from '@mikro-orm/core';

export class WagerTransactionEntity {
  id!: string;
  providerId!: string;
  externalTransactionId!: string;
  idempotencyKey!: string;
  playerId!: string;
  walletId!: string;
  roundId!: string;
  gameId?: string;
  type!: string;
  status!: string;
  amount!: string;
  currency!: string;
  referenceTransactionId?: string;
  referenceExternalTransactionId?: string;
  failureCode?: string;
  payloadHash!: string;
  createdAt!: Date;
  updatedAt!: Date;
  processedAt?: Date;
  pendingReferenceAttempts!: number;
  pendingReferenceSince?: Date | null;
}

export const WagerTransactionSchema = new EntitySchema({
  class: WagerTransactionEntity,
  tableName: 'wager_transactions',
  properties: {
    id: { type: String, primary: true }, providerId: { type: String, fieldName: 'provider_id' },
    externalTransactionId: { type: String, fieldName: 'external_transaction_id' }, idempotencyKey: { type: String, fieldName: 'idempotency_key' },
    playerId: { type: String, fieldName: 'player_id' }, walletId: { type: String, fieldName: 'wallet_id' }, roundId: { type: String, fieldName: 'round_id' },
    gameId: { type: String, nullable: true }, type: { type: String }, status: { type: String }, amount: { type: 'numeric', precision: 20, scale: 2 }, currency: { type: String, length: 3 },
    referenceTransactionId: { type: String, fieldName: 'reference_transaction_id', nullable: true }, referenceExternalTransactionId: { type: String, fieldName: 'reference_external_transaction_id', nullable: true },
    failureCode: { type: String, fieldName: 'failure_code', nullable: true }, payloadHash: { type: String, fieldName: 'payload_hash' }, createdAt: { type: Date, fieldName: 'created_at' }, updatedAt: { type: Date, fieldName: 'updated_at' }, processedAt: { type: Date, fieldName: 'processed_at', nullable: true }, pendingReferenceAttempts: { type: Number, fieldName: 'pending_reference_attempts', default: 0 }, pendingReferenceSince: { type: Date, fieldName: 'pending_reference_since', nullable: true },
  },
  uniques: [{ name: 'uq_wager_provider_external', properties: ['providerId', 'externalTransactionId'] }, { name: 'uq_wager_provider_idempotency', properties: ['providerId', 'idempotencyKey'] }],
  indexes: [{ name: 'ix_wager_wallet_status', properties: ['walletId', 'status'] }],
});