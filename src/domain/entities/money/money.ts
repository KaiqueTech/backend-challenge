import { Decimal } from 'decimal.js';

const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class Money {
  private readonly amount: Decimal;
  public readonly currency: string;

  private constructor(amount: Decimal, currency: string) {
    this.amount = amount;
    this.currency = currency;
  }

  public static create(amount: string, currency: string): Money {
    if (typeof currency !== 'string') {
      throw new Error(`Invalid currency: ${currency}`);
    }

    const normalizedCurrency = currency.trim().toUpperCase();

    if (!CURRENCY_PATTERN.test(normalizedCurrency)) {
      throw new Error(`Invalid currency: ${currency}`);
    }

    if (typeof amount !== 'string' || amount.trim() === '') {
      throw new Error(`Invalid monetary amount: ${amount}`);
    }

    const normalizedAmount = amount.trim();

    if (!/^-?\d+(?:\.\d+)?$/.test(normalizedAmount)) {
      throw new Error(`Invalid monetary amount: ${amount}`);
    }

    const decimalPlaces = normalizedAmount.split('.')[1]?.length ?? 0;

    if (decimalPlaces > 2 || normalizedAmount.startsWith('-')) {
      throw new Error(`Invalid monetary amount: ${amount}`);
    }

    let decimalAmount: Decimal;

    try {
      decimalAmount = new Decimal(normalizedAmount);
    } catch {
      throw new Error(`Invalid monetary amount: ${amount}`);
    }

    if (!decimalAmount.isFinite()) {
      throw new Error(`Invalid monetary amount: ${amount}`);
    }

    return new Money(decimalAmount, normalizedCurrency);
  }

  public static from(props: { amount: string; currency: string }): Money {
    return Money.create(props.amount, props.currency);
  }

  public static zero(currency: string): Money {
    return Money.create('0.00', currency);
  }

  public add(other: Money): Money {
    this.ensureSameCurrency(other);

    return new Money(
      this.amount.plus(other.amount),
      this.currency,
    );
  }

  public subtract(other: Money): Money {
    this.ensureSameCurrency(other);

    return Money.fromDecimal(
      this.amount.minus(other.amount),
      this.currency,
    );
  }

  public negate(): Money {
    return Money.fromDecimal(this.amount.negated(), this.currency);
  }

  public isGreaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);

    return this.amount.greaterThan(other.amount);
  }

  public isGreaterThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);

    return this.amount.greaterThanOrEqualTo(other.amount);
  }

  public isLessThan(other: Money): boolean {
    this.ensureSameCurrency(other);

    return this.amount.lessThan(other.amount);
  }

  public isLessThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);

    return this.amount.lessThanOrEqualTo(other.amount);
  }

  public equals(other: Money): boolean {
    return (
      this.currency === other.currency &&
      this.amount.equals(other.amount)
    );
  }

  public isZero(): boolean {
    return this.amount.isZero();
  }

  public isPositive(): boolean {
    return this.amount.isPositive();
  }

  public isNegative(): boolean {
    return this.amount.isNegative();
  }

  public toString(): string {
    return this.amount.toFixed(2);
  }

  public toJSON(): {
    amount: string;
    currency: string;
  } {
    return {
      amount: this.toString(),
      currency: this.currency,
    };
  }

  private ensureSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Currency mismatch: ${this.currency} and ${other.currency}`,
      );
    }
  }

  private static fromDecimal(amount: Decimal, currency: string): Money {
    return new Money(amount, currency);
  }
}