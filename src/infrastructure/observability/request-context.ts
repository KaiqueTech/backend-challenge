import { AsyncLocalStorage } from 'node:async_hooks';

export interface ObservabilityContext {
  correlationId?: string;
  messageId?: string;
  transactionId?: string;
  walletId?: string;
  providerId?: string;
}

const storage = new AsyncLocalStorage<ObservabilityContext>();

export function withObservabilityContext<T>(context: ObservabilityContext, callback: () => T): T {
  const parent = storage.getStore();
  return storage.run({ ...parent, ...context }, callback);
}

export function observabilityContext(): ObservabilityContext {
  return { ...storage.getStore() };
}
