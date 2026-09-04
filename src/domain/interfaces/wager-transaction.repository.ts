export interface WagerTransactionRepository<TContext = unknown, TRecord = unknown> {
  findByIdempotency(context: TContext, providerId: string, idempotencyKey: string): Promise<TRecord | null>;
  findByExternalId(context: TContext, providerId: string, externalTransactionId: string): Promise<TRecord | null>;
  findReversal(context: TContext, providerId: string, referenceTransactionId: string, type: string): Promise<TRecord | null>;
}