import { Money } from '../../domain/entities/money/money.js';
import { Wallet } from '../../domain/entities/wallet/wallet.js';
import { WagerTransaction } from '../../domain/entities/wagering/wager-transaction.js';

export const WAGERING_OPERATIONS = Symbol('WAGERING_OPERATIONS');

export interface LedgerPage {
  items: Array<Record<string, unknown>>;
  nextCursor?: string;
}

export interface ReconciliationResult {
  walletId: string;
  storedBalance: Money;
  calculatedBalance: Money;
  difference: Money;
  consistent: boolean;
  checkedEntries: number;
}

export interface WageringOperations {
  createWallet(props: { id: string; playerId: string; initialBalance: Money }): Promise<Wallet>;
  process(transaction: WagerTransaction): Promise<WagerTransaction>;
  findWallet(walletId: string): Promise<Wallet | null>;
  listLedger(walletId: string, cursor?: string, limit?: number): Promise<LedgerPage>;
  findTransaction(transactionId: string): Promise<WagerTransaction | null>;
  findTransactionByExternal(providerId: string, externalTransactionId: string): Promise<WagerTransaction | null>;
  reconcile(walletId: string): Promise<ReconciliationResult | null>;
}