import { describe, expect, it } from 'vitest';
import { Money } from '../money/money.js';
import { Wallet } from './wallet.js';

const money = (value: string) => Money.create(value, 'BRL');
const createWallet = () => Wallet.open({
  id: 'wallet-1',
  playerId: 'player-1',
  initialBalance: money('100.00'),
});

describe('Wallet', () => {
  it('opens with balance and version one', () => {
    const wallet = createWallet();
    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.getVersion()).toBe(1);
    expect(wallet.getCurrency()).toBe('BRL');
  });

  it('credits and debits with immutable changes', () => {
    const wallet = createWallet();
    const createdAt = wallet.getUpdatedAt();
    const credit = wallet.credit(money('20.50'));
    const debit = wallet.debit(money('30.25'));

    expect(credit.balanceAfter.toString()).toBe('120.50');
    expect(debit.balanceAfter.toString()).toBe('90.25');
    expect(wallet.balance.toString()).toBe('90.25');
    expect(wallet.getVersion()).toBe(3);
    expect(wallet.getUpdatedAt().getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
  });

  it.each(['0.00', '-1.00'])('rejects operation amount %s without mutation', (value) => {
    const wallet = createWallet();
    expect(() => wallet.debit(money(value))).toThrow();
    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.getVersion()).toBe(1);
  });

  it('rejects insufficient funds and wrong currency without mutation', () => {
    const wallet = createWallet();
    expect(() => wallet.debit(money('100.01'))).toThrow('Insufficient wallet balance');
    expect(() => wallet.credit(Money.create('1.00', 'USD'))).toThrow();
    expect(wallet.balance.toString()).toBe('100.00');
    expect(wallet.getVersion()).toBe(1);
  });
});
