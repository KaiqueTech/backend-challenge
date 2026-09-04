export interface WalletRepository<TContext = unknown, TRecord = unknown> {
  findForUpdate(context: TContext, id: string): Promise<TRecord | null>;
  findById(context: TContext, id: string): Promise<TRecord | null>;
}