import { describe, expect, it } from 'vitest';
import { LedgerDirection } from '../ledger/ledger-entry.js';
import { Money } from '../money/money.js';
import { WagerTransactionProcessor } from './wager-transaction-processor.js';
import {
  WagerTransaction,
  WagerTransactionKind,
  WagerTransactionStatus,
} from './wager-transaction.js';
import { Wallet } from '../wallet/wallet.js';

const money = (value: string) => Money.create(value, 'BRL');
const wallet = () => Wallet.open({ id: 'wallet-1', playerId: 'player-1', initialBalance: money('100.00') });
const tx = (id: string, kind: WagerTransactionKind, amount = '20.00', referenceExternalTransactionId?: string) => WagerTransaction.create({
  id, providerId: 'provider-1', externalTransactionId: id, walletId: 'wallet-1',
  playerId: 'player-1', roundId: 'round-1', payloadHash: `hash-${id}`,
  kind, money: money(amount), referenceExternalTransactionId,
});

describe('WagerTransaction', () => {
  it('starts pending and rejects opening transactions', () => {
    expect(tx('bet-1', WagerTransactionKind.Bet).status).toBe(WagerTransactionStatus.Pending);
    expect(() => tx('opening-1', WagerTransactionKind.Opening)).toThrow('OPENING');
  });

  it('requires references for refund and rollback', () => {
    expect(() => tx('refund-1', WagerTransactionKind.Refund)).toThrow('reference');
    expect(() => tx('rollback-1', WagerTransactionKind.Rollback)).toThrow('reference');
  });

  it('does not allow terminal transitions', () => {
    const transaction = tx('bet-1', WagerTransactionKind.Bet);
    transaction.markProcessed();
    expect(() => transaction.reject('INVALID_OPERATION')).toThrow('Terminal transaction');
  });

  it('rehydrates persisted state', () => {
    const transaction = WagerTransaction.rehydrate({
      ...tx('bet-1', WagerTransactionKind.Bet),
      status: WagerTransactionStatus.Processed,
      processedAt: new Date(),
    });
    expect(transaction.status).toBe(WagerTransactionStatus.Processed);
  });
});

describe('WagerTransactionProcessor', () => {
  it('processes bet, win and loss with correct ledger effects', () => {
    const currentWallet = wallet();
    const bet = tx('bet-1', WagerTransactionKind.Bet);
    const betLedger = WagerTransactionProcessor.process(bet, currentWallet);
    expect(betLedger?.direction).toBe(LedgerDirection.Debit);
    expect(currentWallet.balance.toString()).toBe('80.00');

    const win = tx('win-1', WagerTransactionKind.Win, '10.00');
    const winLedger = WagerTransactionProcessor.process(win, currentWallet);
    expect(winLedger?.direction).toBe(LedgerDirection.Credit);

    const loss = tx('loss-1', WagerTransactionKind.Loss, '10.00');
    expect(WagerTransactionProcessor.process(loss, currentWallet)).toBeUndefined();
    expect(loss.status).toBe(WagerTransactionStatus.Processed);
  });

  it('refunds a processed bet once and preserves the original replay result', () => {
    const currentWallet = wallet();
    const bet = tx('bet-1', WagerTransactionKind.Bet, '20.00');
    WagerTransactionProcessor.process(bet, currentWallet);
    const refund = tx('refund-1', WagerTransactionKind.Refund, '20.00', 'bet-1');
    const ledger = WagerTransactionProcessor.process(refund, currentWallet, { reference: bet });
    expect(ledger?.direction).toBe(LedgerDirection.Credit);
    expect(currentWallet.balance.toString()).toBe('100.00');
    expect(WagerTransactionProcessor.process(refund, currentWallet, { reference: bet })).toBe(ledger);

    const secondRefund = tx('refund-2', WagerTransactionKind.Refund, '20.00', 'bet-1');
    expect(WagerTransactionProcessor.process(secondRefund, currentWallet, { reference: bet })).toBeUndefined();
    expect(secondRefund.failureCode).toBe('DUPLICATE_REVERSAL');
  });

  it('marks missing references pending and rejects invalid reversal amounts', () => {
    const currentWallet = wallet();
    const refund = tx('refund-1', WagerTransactionKind.Refund, '20.00', 'bet-missing');
    expect(WagerTransactionProcessor.process(refund, currentWallet)).toBeUndefined();
    expect(refund.status).toBe(WagerTransactionStatus.PendingReference);

    const bet = tx('bet-1', WagerTransactionKind.Bet, '20.00');
    WagerTransactionProcessor.process(bet, currentWallet);
    const invalidRefund = tx('refund-2', WagerTransactionKind.Refund, '10.00', 'bet-1');
    expect(WagerTransactionProcessor.process(invalidRefund, currentWallet, { reference: bet })).toBeUndefined();
    expect(invalidRefund.failureCode).toBe('AMOUNT_MISMATCH');
  });

  it('inverts a credit reference for rollback', () => {
    const currentWallet = wallet();
    const win = tx('win-1', WagerTransactionKind.Win, '20.00');
    WagerTransactionProcessor.process(win, currentWallet);
    const rollback = tx('rollback-1', WagerTransactionKind.Rollback, '20.00', 'win-1');
    const ledger = WagerTransactionProcessor.process(rollback, currentWallet, { reference: win });
    expect(ledger?.direction).toBe(LedgerDirection.Debit);
    expect(currentWallet.balance.toString()).toBe('100.00');
  });
});
