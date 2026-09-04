import { Money } from '../../../../domain/entities/money/money.js';
import { WagerTransaction, WagerTransactionState } from '../../../../domain/entities/wagering/wager-transaction.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';

export class WagerTransactionMapper {
  static toDomain(entity: WagerTransactionEntity): WagerTransaction {
    const state: WagerTransactionState = {
      id: entity.id,
      providerId: entity.providerId,
      externalTransactionId: entity.externalTransactionId,
      idempotencyKey: entity.idempotencyKey,
      payloadHash: entity.payloadHash,
      walletId: entity.walletId,
      playerId: entity.playerId,
      roundId: entity.roundId,
      gameId: entity.gameId,
      kind: entity.type as WagerTransactionState['kind'],
      money: Money.create(entity.amount, entity.currency),
      referenceExternalTransactionId: entity.referenceExternalTransactionId,
      status: entity.status as WagerTransactionState['status'],
      referenceTransactionId: entity.referenceTransactionId,
      failureCode: entity.failureCode as WagerTransactionState['failureCode'],
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      processedAt: entity.processedAt,
    };
    return WagerTransaction.rehydrate(state);
  }

  static toEntity(transaction: WagerTransaction, entity = new WagerTransactionEntity()): WagerTransactionEntity {
    entity.id = transaction.id;
    entity.providerId = transaction.providerId;
    entity.externalTransactionId = transaction.externalTransactionId;
    entity.idempotencyKey = transaction.idempotencyKey;
    entity.playerId = transaction.playerId;
    entity.walletId = transaction.walletId;
    entity.roundId = transaction.roundId;
    entity.gameId = transaction.gameId;
    entity.type = transaction.kind;
    entity.status = transaction.status;
    entity.amount = transaction.money.toString();
    entity.currency = transaction.money.currency;
    entity.referenceExternalTransactionId = transaction.referenceExternalTransactionId;
    entity.referenceTransactionId = transaction.referenceTransactionId;
    entity.failureCode = transaction.failureCode;
    entity.payloadHash = transaction.payloadHash;
    entity.createdAt = transaction.createdAt;
    entity.updatedAt = transaction.updatedAt;
    entity.processedAt = transaction.processedAt;
    return entity;
  }
}