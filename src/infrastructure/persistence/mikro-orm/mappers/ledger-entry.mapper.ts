import { LedgerDirection, WalletLedgerEntry } from '../../../../domain/entities/ledger/ledger-entry.js';
import { Money } from '../../../../domain/entities/money/money.js';
import { LedgerEntryEntity } from '../entities/ledger-entry.entity.js';

export class LedgerEntryMapper {
  static toEntity(entry: WalletLedgerEntry, entity = new LedgerEntryEntity()): LedgerEntryEntity {
    entity.id = entry.id;
    entity.walletId = entry.walletId;
    entity.transactionId = entry.transactionId;
    entity.type = entry.direction;
    entity.amount = entry.money.toString();
    entity.balanceBefore = entry.balanceBefore.toString();
    entity.balanceAfter = entry.balanceAfter.toString();
    entity.currency = entry.money.currency;
    entity.createdAt = entry.createdAt;
    return entity;
  }

  static toDomain(entity: LedgerEntryEntity): WalletLedgerEntry {
    return WalletLedgerEntry.rehydrate({
      id: entity.id,
      walletId: entity.walletId,
      transactionId: entity.transactionId,
      direction: entity.type as LedgerDirection,
      money: Money.create(entity.amount, entity.currency),
      balanceBefore: Money.create(entity.balanceBefore, entity.currency),
      balanceAfter: Money.create(entity.balanceAfter, entity.currency),
      createdAt: entity.createdAt,
    });
  }
}