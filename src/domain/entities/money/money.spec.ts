import { describe, expect, it } from 'vitest';
import { Money } from './money.js';

describe('Money', () => {
  it('should create money with two decimal places', () => {
    const money = Money.create('100', 'BRL');

    expect(money.toString()).toBe('100.00');
    expect(money.currency).toBe('BRL');
  });

  it('should preserve decimal precision', () => {
    const money = Money.create('100.25', 'BRL');

    expect(money.toString()).toBe('100.25');
  });

  it('should add money', () => {
    const first = Money.create('100.25', 'BRL');
    const second = Money.create('50.75', 'BRL');

    const result = first.add(second);

    expect(result.toString()).toBe('151.00');
  });

  it('should subtract money', () => {
    const first = Money.create('100.00', 'BRL');
    const second = Money.create('30.50', 'BRL');

    const result = first.subtract(second);

    expect(result.toString()).toBe('69.50');
  });

  it('should reject different currencies', () => {
    const brl = Money.create('100.00', 'BRL');
    const usd = Money.create('100.00', 'USD');

    expect(() => brl.add(usd)).toThrow(
      'Currency mismatch: BRL and USD',
    );
  });

  it('should compare values', () => {
    const first = Money.create('100.00', 'BRL');
    const second = Money.create('80.00', 'BRL');

    expect(first.isGreaterThan(second)).toBe(true);
    expect(first.isGreaterThanOrEqual(second)).toBe(true);
    expect(second.isLessThan(first)).toBe(true);
  });

  it('should compare equality', () => {
    const first = Money.create('100.00', 'BRL');
    const second = Money.create('100', 'BRL');

    expect(first.equals(second)).toBe(true);
  });

  it('should reject invalid currency', () => {
    expect(() => Money.create('100.00', 'BR')).toThrow();
    expect(() => Money.create('100.00', 'BRL1')).toThrow();
    expect(() => Money.create('100.00', '123')).toThrow();
  });

  it('should reject invalid monetary values', () => {
    expect(() => Money.create('abc', 'BRL')).toThrow();
    expect(() => Money.create('NaN', 'BRL')).toThrow();
    expect(() => Money.create('Infinity', 'BRL')).toThrow();
  });

  it('should not mutate the original money', () => {
    const original = Money.create('100.00', 'BRL');
    const addition = Money.create('50.00', 'BRL');

    const result = original.add(addition);

    expect(original.toString()).toBe('100.00');
    expect(result.toString()).toBe('150.00');
  });
});