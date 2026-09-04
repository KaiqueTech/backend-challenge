import { createHash } from 'node:crypto';

export interface WagerPayloadForHash {
  providerId: string;
  externalTransactionId: string;
  walletId: string;
  playerId: string;
  roundId: string;
  type: string;
  amount: string;
  currency: string;
  referenceExternalTransactionId?: string;
}

export function canonicalPayload(payload: WagerPayloadForHash): string {
  return JSON.stringify(Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined).sort(([left], [right]) => left.localeCompare(right)),
  ));
}

export function payloadHash(payload: WagerPayloadForHash): string {
  return createHash('sha256').update(canonicalPayload(payload), 'utf8').digest('hex');
}