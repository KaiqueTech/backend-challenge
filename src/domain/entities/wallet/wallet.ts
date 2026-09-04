import { Money } from '../money/money.js';

export interface WalletState {
  id: string;
  playerId: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BalanceChange {
  balanceBefore: Money;
  balanceAfter: Money;
}

export class Wallet {
  private balanceValue: Money;
  private version: number;
  private updatedAtValue: Date;

  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    balance: Money,
    version: number,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.balanceValue = balance;
    this.version = version;
    this.createdAtValue = new Date(createdAt);
    this.updatedAtValue = new Date(updatedAt);
  }

  private readonly createdAtValue: Date;

  public get createdAt(): Date {
    return new Date(this.createdAtValue);
  }

  public get updatedAt(): Date {
    return new Date(this.updatedAtValue);
  }

  public static create(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
    now?: Date;
  }): Wallet {
    Wallet.assertIdentifier(props.id, 'wallet id');
    Wallet.assertIdentifier(props.playerId, 'player id');

    const now = props.now ?? new Date();
    Wallet.assertCurrency(props.initialBalance, props.initialBalance.currency);

    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      new Date(now),
      new Date(now),
    );
  }

  public static open(props: {
    id: string;
    playerId: string;
    initialBalance: Money;
  }): Wallet {
    return Wallet.create(props);
  }

  public static rehydrate(state: WalletState): Wallet {
    if (state.version < 1) {
      throw new Error('Invalid wallet version');
    }

    return new Wallet(
      state.id,
      state.playerId,
      state.balance.currency,
      state.balance,
      state.version,
      new Date(state.createdAt),
      new Date(state.updatedAt),
    );
  }

  public credit(amount: Money, now = new Date()): BalanceChange {
    this.assertOperationAmount(amount);

    return this.apply(amount, now);
  }

  public debit(amount: Money, now = new Date()): BalanceChange {
    this.assertOperationAmount(amount);

    if (this.balanceValue.isLessThan(amount)) {
      throw new Error('Insufficient wallet balance');
    }

    return this.apply(amount.negate(), now);
  }

  public getBalance(): Money {
    return this.balanceValue;
  }

  public get balance(): Money {
    return this.balanceValue;
  }

  public getVersion(): number {
    return this.version;
  }

  public getCurrency(): string {
    return this.currency;
  }

  public getId(): string {
    return this.id;
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public getCreatedAt(): Date {
    return this.createdAt;
  }

  public getUpdatedAt(): Date {
    return this.updatedAt;
  }

  private apply(delta: Money, now: Date): BalanceChange {
    const balanceBefore = this.balanceValue;
    const balanceAfter = delta.isNegative()
      ? balanceBefore.subtract(delta.negate())
      : balanceBefore.add(delta);

    if (balanceAfter.isNegative()) {
      throw new Error('Wallet balance cannot be negative');
    }

    this.balanceValue = balanceAfter;
    this.version += 1;
    this.updatedAtValue = new Date(now);

    return { balanceBefore, balanceAfter };
  }

  private assertOperationAmount(amount: Money): void {
    Wallet.assertCurrency(amount, this.currency);

    if (amount.isZero()) {
      throw new Error('Financial operation amount must be positive');
    }

    if (amount.isNegative()) {
      throw new Error('Financial operation amount must be positive');
    }
  }

  private static assertCurrency(money: Money, currency: string): void {
    if (money.currency !== currency) {
      throw new Error(`Currency mismatch: ${currency} and ${money.currency}`);
    }
  }

  private static assertIdentifier(value: string, name: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`Invalid ${name}`);
    }
  }
}