import { randomUUID } from 'node:crypto';
import { payloadHash } from '../application/payload-hash.js';
import { Money } from '../domain/entities/money/money.js';
import { WagerTransaction } from '../domain/entities/wagering/wager-transaction.js';
import { CreateWagerTransactionDto } from '../application/dto/wager.dto.js';

export function toWalletResponse(wallet: { id: string; playerId: string; currency: string; balance: Money; getVersion(): number; createdAt: Date; updatedAt: Date }) {
  return { id: wallet.id, playerId: wallet.playerId, currency: wallet.currency, balance: wallet.balance.toString(), version: wallet.getVersion(), createdAt: wallet.createdAt.toISOString(), updatedAt: wallet.updatedAt.toISOString() };
}

export function toTransactionResponse(transaction: WagerTransaction, balance?: Money, idempotentReplay = false) {
  return { transactionId: transaction.id, providerId: transaction.providerId, externalTransactionId: transaction.externalTransactionId, walletId: transaction.walletId, playerId: transaction.playerId, roundId: transaction.roundId, type: transaction.kind, status: transaction.status, amount: transaction.money.toString(), currency: transaction.money.currency, referenceTransactionId: transaction.referenceTransactionId, failureCode: transaction.failureCode, createdAt: transaction.createdAt.toISOString(), updatedAt: transaction.updatedAt.toISOString(), processedAt: transaction.processedAt?.toISOString(), balance: balance?.toString(), idempotentReplay };
}

export function toTransaction(dto: CreateWagerTransactionDto, idempotencyKey: string): WagerTransaction {
  return WagerTransaction.create({
    id: randomUUID(), providerId: dto.providerId, externalTransactionId: dto.externalTransactionId,
    idempotencyKey, playerId: dto.playerId, walletId: dto.walletId, roundId: dto.roundId, gameId: dto.gameId,
    kind: dto.kind, money: Money.create(dto.money.amount, dto.money.currency), referenceExternalTransactionId: dto.referenceExternalTransactionId,
    payloadHash: payloadHash({ providerId: dto.providerId, externalTransactionId: dto.externalTransactionId, walletId: dto.walletId, playerId: dto.playerId, roundId: dto.roundId, type: dto.kind, amount: dto.money.amount, currency: dto.money.currency, referenceExternalTransactionId: dto.referenceExternalTransactionId }),
  });
}
