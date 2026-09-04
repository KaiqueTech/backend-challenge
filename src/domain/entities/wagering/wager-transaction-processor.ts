import {
  LedgerDirection,
  WalletLedgerEntry,
} from '../ledger/ledger-entry.js';
import { BalanceChange, Wallet } from '../wallet/wallet.js';
import {
  FailureCode,
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction.js';

export interface ProcessWagerTransactionOptions {
  reference?: WagerTransaction;
  reversedOperations?: Set<string>;
  at?: Date;
  ledgerId?: string;
}

export class WagerTransactionProcessor {
  private static readonly processedResults = new WeakMap<
    WagerTransaction,
    WalletLedgerEntry | undefined
  >();

  public static process(
    transaction: WagerTransaction,
    wallet: Wallet,
    options: ProcessWagerTransactionOptions = {},
  ): WalletLedgerEntry | undefined {
    if (transaction.isTerminal()) {
      return WagerTransactionProcessor.processedResults.get(transaction);
    }

    if (transaction.kind === WagerTransactionKind.Opening) {
      transaction.reject('INVALID_OPERATION');
      return undefined;
    }

    try {
      WagerTransactionProcessor.assertWalletCompatibility(transaction, wallet);
    } catch {
      transaction.reject('REFERENCE_MISMATCH');
      return undefined;
    }

    if (transaction.requiresReference() && !options.reference) {
      transaction.markPendingReference();
      return undefined;
    }

    if (transaction.kind === WagerTransactionKind.Refund ||
        transaction.kind === WagerTransactionKind.Rollback) {
      return WagerTransactionProcessor.processReversal(transaction, wallet, options);
    }

    if (transaction.kind === WagerTransactionKind.Loss) {
      transaction.markProcessed(undefined, options.at);
      return undefined;
    }

    try {
      const change = transaction.kind === WagerTransactionKind.Bet
        ? wallet.debit(transaction.money, options.at)
        : wallet.credit(transaction.money, options.at);
      transaction.markProcessed(undefined, options.at);
      const ledger = WagerTransactionProcessor.createLedger(
        transaction,
        change,
        transaction.ledgerDirectionFor(),
        options.at,
        options.ledgerId,
      );
      WagerTransactionProcessor.processedResults.set(transaction, ledger);
      return ledger;
    } catch {
      transaction.reject('INSUFFICIENT_FUNDS');
      return undefined;
    }
  }

  private static processReversal(
    transaction: WagerTransaction,
    wallet: Wallet,
    options: ProcessWagerTransactionOptions,
  ): WalletLedgerEntry | undefined {
    const reference = options.reference;

    if (!reference) return undefined;

    if (reference.status !== WagerTransactionStatus.Processed) {
      transaction.reject('REFERENCE_NOT_PROCESSED');
      return undefined;
    }

    if (transaction.kind === WagerTransactionKind.Refund &&
        reference.kind !== WagerTransactionKind.Bet) {
      transaction.reject('INVALID_REFERENCE');
      return undefined;
    }

    if (transaction.kind === WagerTransactionKind.Rollback &&
        reference.kind !== WagerTransactionKind.Bet &&
        reference.kind !== WagerTransactionKind.Win &&
        reference.kind !== WagerTransactionKind.Refund) {
      transaction.reject('INVALID_REFERENCE');
      return undefined;
    }

    if (!WagerTransactionProcessor.sameReferenceContext(transaction, reference)) {
      transaction.reject('REFERENCE_MISMATCH');
      return undefined;
    }

    if (!transaction.money.equals(reference.money)) {
      transaction.reject('AMOUNT_MISMATCH');
      return undefined;
    }

    const reversalKey = `${transaction.kind}:${reference.id}`;
    if (reference.hasReversal(transaction.kind) ||
      options.reversedOperations?.has(reversalKey)) {
      transaction.reject('DUPLICATE_REVERSAL');
      return undefined;
    }

    const direction = transaction.ledgerDirectionFor(reference);
    let change: BalanceChange;

    try {
      change = direction === LedgerDirection.Credit
        ? wallet.credit(transaction.money, options.at)
        : wallet.debit(transaction.money, options.at);
    } catch {
      transaction.reject('ROLLBACK_NEGATIVE_BALANCE');
      return undefined;
    }

    options.reversedOperations?.add(reversalKey);
    reference.registerReversal(transaction.kind);
    transaction.markProcessed(reference.id, options.at);
    const ledger = WagerTransactionProcessor.createLedger(
      transaction,
      change,
      direction,
      options.at,
      options.ledgerId,
    );
    WagerTransactionProcessor.processedResults.set(transaction, ledger);
    return ledger;
  }

  private static createLedger(
    transaction: WagerTransaction,
    change: BalanceChange,
    direction: LedgerDirection,
    at = new Date(),
    ledgerId = `${transaction.id}:ledger`,
  ): WalletLedgerEntry {
    return WalletLedgerEntry.create({
      id: ledgerId,
      walletId: transaction.walletId,
      transactionId: transaction.id,
      direction,
      money: transaction.money,
      balanceBefore: change.balanceBefore,
      balanceAfter: change.balanceAfter,
      createdAt: at,
    });
  }

  private static sameReferenceContext(
    transaction: WagerTransaction,
    reference: WagerTransaction,
  ): boolean {
    return transaction.providerId === reference.providerId &&
      transaction.playerId === reference.playerId &&
      transaction.walletId === reference.walletId &&
      transaction.money.currency === reference.money.currency &&
      transaction.roundId === reference.roundId;
  }

  private static assertWalletCompatibility(
    transaction: WagerTransaction,
    wallet: Wallet,
  ): void {
    if (transaction.walletId !== wallet.getId() ||
        transaction.playerId !== wallet.getPlayerId() ||
        transaction.money.currency !== wallet.getCurrency()) {
      throw new Error('Wallet context mismatch');
    }
  }
}

export type { FailureCode };