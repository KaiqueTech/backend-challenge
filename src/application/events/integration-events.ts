import type { LedgerDirection, WalletLedgerEntry } from '../../domain/entities/ledger/ledger-entry.js';
import type { Money } from '../../domain/entities/money/money.js';
import type { Wallet } from '../../domain/entities/wallet/wallet.js';
import type { WagerTransaction } from '../../domain/entities/wagering/wager-transaction.js';

export interface IntegrationEventEnvelope {
  eventId: string;
  eventType: string;
  aggregateId: string;
  correlationId: string;
  occurredAt: string;
  version: number;
  data: Record<string, unknown>;
}

function moneyData(money: Money): { amount: string; currency: string } {
  return money.toJSON();
}

export function transactionEvent(transaction: WagerTransaction, eventType: 'WagerTransactionProcessed' | 'WagerTransactionRejected' | 'WagerTransactionPendingReference' | 'WagerTransactionFailed'): IntegrationEventEnvelope {
  return {
    eventId: `${eventType}:${transaction.id}`,
    eventType,
    aggregateId: transaction.id,
    correlationId: transaction.id,
    occurredAt: (transaction.processedAt ?? transaction.updatedAt).toISOString(),
    version: 1,
    data: { transactionId: transaction.id, providerId: transaction.providerId, externalTransactionId: transaction.externalTransactionId, walletId: transaction.walletId, status: transaction.status, kind: transaction.kind, money: moneyData(transaction.money), failureCode: transaction.failureCode },
  };
}

export function walletBalanceChangedEvent(wallet: Wallet, entry: WalletLedgerEntry, transaction: WagerTransaction): IntegrationEventEnvelope {
  return {
    eventId: `WalletBalanceChanged:${transaction.id}`,
    eventType: 'WalletBalanceChanged',
    aggregateId: wallet.id,
    correlationId: transaction.id,
    occurredAt: entry.createdAt.toISOString(),
    version: 1,
    data: { walletId: wallet.id, transactionId: transaction.id, direction: entry.direction as LedgerDirection, money: moneyData(entry.money), balanceBefore: moneyData(entry.balanceBefore), balanceAfter: moneyData(entry.balanceAfter), walletVersion: wallet.getVersion() },
  };
}