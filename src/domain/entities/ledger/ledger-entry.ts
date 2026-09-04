import { Money } from '../money/money.js';
import { LedgerDirection } from '../../enuns/ledger-direction.enun.js';

export { LedgerDirection } from '../../enuns/ledger-direction.enun.js';

export interface LedgerEntryState {
  id: string;
  walletId: string;
  transactionId: string;
  direction: LedgerDirection;
  money: Money;
  balanceBefore: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export class WalletLedgerEntry {
  private readonly createdAtValue: Date;

  private constructor(
    public readonly id: string,
    public readonly walletId: string,
    public readonly transactionId: string,
    public readonly direction: LedgerDirection,
    public readonly money: Money,
    public readonly balanceBefore: Money,
    public readonly balanceAfter: Money,
    createdAt: Date,
  ) {
    this.createdAtValue = new Date(createdAt);
    Object.freeze(this);
  }

  public get createdAt(): Date {
    return new Date(this.createdAtValue);
  }

  public static create(props: LedgerEntryState): WalletLedgerEntry {
    if (props.money.isZero() || props.money.isNegative()) {
      throw new Error('Ledger amount must be positive');
    }

    if (props.money.currency !== props.balanceBefore.currency ||
        props.money.currency !== props.balanceAfter.currency) {
      throw new Error('Ledger currencies must match');
    }

    const expected = props.direction === LedgerDirection.Credit
      ? props.balanceBefore.add(props.money)
      : props.balanceBefore.subtract(props.money);

    if (!expected.equals(props.balanceAfter)) {
      throw new Error('Ledger entry is not balanced');
    }

    return new WalletLedgerEntry(
      props.id,
      props.walletId,
      props.transactionId,
      props.direction,
      props.money,
      props.balanceBefore,
      props.balanceAfter,
      props.createdAt,
    );
  }

  public static rehydrate(state: LedgerEntryState): WalletLedgerEntry {
    return WalletLedgerEntry.create(state);
  }

  public isBalanced(): boolean {
    const expected = this.direction === LedgerDirection.Credit
      ? this.balanceBefore.add(this.money)
      : this.balanceBefore.subtract(this.money);

    return expected.equals(this.balanceAfter);
  }
}