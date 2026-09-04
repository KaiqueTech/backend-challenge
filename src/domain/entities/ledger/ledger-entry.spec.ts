import { describe, expect, it } from 'vitest';
import { Money } from '../money/money.js';
import { LedgerDirection, WalletLedgerEntry } from './ledger-entry.js';

const money = (value: string) => Money.create(value, 'BRL');

describe('WalletLedgerEntry', () => {
  it('creates a balanced immutable debit entry', () => {
    const entry = WalletLedgerEntry.create({
      id: 'ledger-1',
      walletId: 'wallet-1',
      transactionId: 'tx-1',
      direction: LedgerDirection.Debit,
      money: money('20.00'),
      balanceBefore: money('100.00'),
      balanceAfter: money('80.00'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(entry.isBalanced()).toBe(true);
    expect(entry.direction).toBe(LedgerDirection.Debit);
    expect(entry.balanceAfter.toString()).toBe('80.00');
    const date = entry.createdAt;
    date.setFullYear(2000);
    expect(entry.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('rejects unbalanced entries', () => {
    expect(() => WalletLedgerEntry.create({
      id: 'ledger-1', walletId: 'wallet-1', transactionId: 'tx-1',
      direction: LedgerDirection.Credit, money: money('20.00'),
      balanceBefore: money('100.00'), balanceAfter: money('110.00'),
      createdAt: new Date(),
    })).toThrow('Ledger entry is not balanced');
  });
});
