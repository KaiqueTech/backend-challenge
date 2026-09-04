import { EntitySchema } from '@mikro-orm/core';

export class WalletEntity {
  id!: string;
  playerId!: string;
  currency!: string;
  balance!: string;
  version!: number;
  createdAt!: Date;
  updatedAt!: Date;
}

export const WalletSchema = new EntitySchema({
  class: WalletEntity,
  tableName: 'wallets',
  properties: {
    id: { type: String, primary: true },
    playerId: { type: String, fieldName: 'player_id' },
    currency: { type: String, length: 3 },
    balance: { type: 'numeric', precision: 20, scale: 2 },
    version: { type: Number },
    createdAt: { type: Date, fieldName: 'created_at' },
    updatedAt: { type: Date, fieldName: 'updated_at' },
  },
  uniques: [{ name: 'uq_wallet_player_currency', properties: ['playerId', 'currency'] }],
});