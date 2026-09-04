import { LedgerDirection } from '../ledger/ledger-entry.js';
import { Money } from '../money/money.js';
import { WagerTransactionKind } from '../../enuns/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../../enuns/wager-transactions-status.enum.js';

export { WagerTransactionKind } from '../../enuns/wager-transaction-kind.enum.js';
export { WagerTransactionStatus } from '../../enuns/wager-transactions-status.enum.js';

export type FailureCode =
  | 'INVALID_OPERATION'
  | 'INVALID_REFERENCE'
  | 'REFERENCE_NOT_PROCESSED'
  | 'REFERENCE_NOT_FOUND'
  | 'DUPLICATE_REVERSAL'
  | 'REFERENCE_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'INSUFFICIENT_FUNDS'
  | 'ROLLBACK_NEGATIVE_BALANCE'
  | 'IDEMPOTENCY_CONFLICT';

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey?: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId?: string;
  kind?: WagerTransactionKind;
  type?: WagerTransactionKind;
  money?: Money;
  amount?: Money;
  referenceExternalTransactionId?: string;
  createdAt?: Date;
}

export interface WagerTransactionState extends CreateWagerTransactionProps {
  status: WagerTransactionStatus;
  referenceTransactionId?: string;
  failureCode?: FailureCode;
  processedAt?: Date;
  updatedAt?: Date;
}

export class WagerTransaction {
  private readonly reversalKeys = new Set<string>();
  private statusValue: WagerTransactionStatus;
  private referenceId?: string;
  private failureCodeValue?: FailureCode;
  private processedAtValue?: Date;
  private updatedAtValue: Date;

  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    status: WagerTransactionStatus,
    referenceTransactionId: string | undefined,
    failureCode: FailureCode | undefined,
    processedAt: Date | undefined,
    updatedAt: Date,
  ) {
    this.statusValue = status;
    this.referenceId = referenceTransactionId;
    this.failureCodeValue = failureCode;
    this.processedAtValue = processedAt ? new Date(processedAt) : undefined;
    this.updatedAtValue = new Date(updatedAt);
  }

  public static create(props: CreateWagerTransactionProps): WagerTransaction {
    const kind = props.kind ?? props.type;
    const money = props.money ?? props.amount;

    if (!kind || !money || !props.payloadHash) {
      throw new Error('Invalid wager transaction');
    }

    if (kind === WagerTransactionKind.Opening) {
      throw new Error('OPENING transactions are internal only');
    }

    if ((kind === WagerTransactionKind.Refund || kind === WagerTransactionKind.Rollback) &&
        !props.referenceExternalTransactionId) {
      throw new Error('Transaction reference is required');
    }

    const createdAt = props.createdAt ?? new Date();

    return new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey ?? props.externalTransactionId,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId ?? '',
      kind,
      money,
      props.referenceExternalTransactionId,
      createdAt,
      WagerTransactionStatus.Pending,
      undefined,
      undefined,
      undefined,
      createdAt,
    );
  }

  public static rehydrate(state: WagerTransactionState): WagerTransaction {
    const createdAt = state.createdAt ?? new Date();
    const transaction = new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey ?? state.externalTransactionId,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId ?? '',
      state.kind ?? state.type!,
      state.money ?? state.amount!,
      state.referenceExternalTransactionId,
      createdAt,
      state.status,
      state.referenceTransactionId,
      state.failureCode,
      state.processedAt,
      state.updatedAt ?? createdAt,
    );
    return transaction;
  }

  public get type(): WagerTransactionKind { return this.kind; }
  public get amount(): Money { return this.money; }
  public get status(): WagerTransactionStatus { return this.statusValue; }
  public get referenceTransactionId(): string | undefined { return this.referenceId; }
  public get failureCode(): FailureCode | undefined { return this.failureCodeValue; }
  public get processedAt(): Date | undefined {
    return this.processedAtValue ? new Date(this.processedAtValue) : undefined;
  }
  public get updatedAt(): Date { return new Date(this.updatedAtValue); }

  public markProcessed(referenceTransactionId?: string, at = new Date()): void {
    this.assertMutable();
    this.statusValue = WagerTransactionStatus.Processed;
    this.referenceId = referenceTransactionId;
    this.processedAtValue = new Date(at);
    this.updatedAtValue = new Date(at);
  }

  public markPendingReference(): void {
    this.assertMutable();
    this.statusValue = WagerTransactionStatus.PendingReference;
    this.updatedAtValue = new Date();
  }

  public reject(code: FailureCode): void {
    this.assertMutable();
    this.statusValue = WagerTransactionStatus.Rejected;
    this.failureCodeValue = code;
    this.updatedAtValue = new Date();
  }

  public fail(code: FailureCode): void {
    this.assertMutable();
    this.statusValue = WagerTransactionStatus.Failed;
    this.failureCodeValue = code;
    this.updatedAtValue = new Date();
  }

  public isTerminal(): boolean {
    return this.statusValue === WagerTransactionStatus.Processed ||
      this.statusValue === WagerTransactionStatus.Rejected ||
      this.statusValue === WagerTransactionStatus.Failed;
  }

  public affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  public requiresReference(): boolean {
    return this.kind === WagerTransactionKind.Refund ||
      this.kind === WagerTransactionKind.Rollback;
  }

  public matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  public hasReversal(kind: WagerTransactionKind): boolean {
    return this.reversalKeys.has(kind);
  }

  public registerReversal(kind: WagerTransactionKind): void {
    this.reversalKeys.add(kind);
  }

  public ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    if (this.kind === WagerTransactionKind.Bet) return LedgerDirection.Debit;
    if (this.kind === WagerTransactionKind.Rollback) {
      if (!reference) throw new Error('Rollback reference is required');
      return reference.ledgerDirectionFor() === LedgerDirection.Credit
        ? LedgerDirection.Debit : LedgerDirection.Credit;
    }
    return LedgerDirection.Credit;
  }

  private assertMutable(): void {
    if (this.isTerminal()) {
      throw new Error(`Terminal transaction cannot change: ${this.statusValue}`);
    }
  }
}