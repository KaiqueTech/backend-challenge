import { Money } from '../../../../domain/entities/money/money.js';
import { Wallet, WalletState } from '../../../../domain/entities/wallet/wallet.js';
import { WalletEntity } from '../entities/wallet.entity.js';

export class WalletMapper {
  static toDomain(entity: WalletEntity): Wallet {
    const state: WalletState = {
      id: entity.id,
      playerId: entity.playerId,
      balance: Money.create(entity.balance, entity.currency),
      version: entity.version,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
    return Wallet.rehydrate(state);
  }

  static toEntity(wallet: Wallet, entity = new WalletEntity()): WalletEntity {
    entity.id = wallet.id;
    entity.playerId = wallet.playerId;
    entity.currency = wallet.currency;
    entity.balance = wallet.balance.toString();
    entity.version = wallet.getVersion();
    entity.createdAt = wallet.createdAt;
    entity.updatedAt = wallet.updatedAt;
    return entity;
  }
}