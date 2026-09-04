export type ProcessingErrorClass = 'BUSINESS' | 'TRANSIENT' | 'PERMANENT';

export function classifyProcessingError(error: unknown): ProcessingErrorClass {
  const message = error instanceof Error ? error.message : String(error);
  if (['INSUFFICIENT_FUNDS', 'INVALID_', 'REFERENCE_', 'DUPLICATE_', 'AMOUNT_', 'ROLLBACK_', 'IDEMPOTENCY_CONFLICT'].some((value) => message.includes(value))) return 'BUSINESS';
  if ([
    'ECONN', 'ETIMEDOUT', 'timeout', 'network', '503', '429',
    '57P01', '53300', '40001', '40P01', 'connection terminated',
    'connection refused', 'socket hang up', 'ServiceUnavailable',
  ].some((value) => message.toLowerCase().includes(value.toLowerCase()))) return 'TRANSIENT';
  return 'PERMANENT';
}

export function retryDelayMs(attempt: number, baseMs = 1000, jitter = Math.random()): number {
  return Math.round(baseMs * (2 ** Math.max(0, attempt - 1)) + jitter * baseMs);
}