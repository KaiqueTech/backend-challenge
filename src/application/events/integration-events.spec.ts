import { describe, expect, it } from 'vitest';
import { Money } from '../../domain/entities/money/money.js';
import { WagerTransaction, WagerTransactionKind } from '../../domain/entities/wagering/wager-transaction.js';
import { transactionEvent } from './integration-events.js';

describe('integration events', () => {
  it('serializes a stable versioned event envelope', () => {
    const transaction = WagerTransaction.create({
      id: 'tx-1',
      providerId: 'provider-1',
      externalTransactionId: 'external-1',
      idempotencyKey: 'provider-1:external-1',
      payloadHash: 'hash-1',
      walletId: 'wallet-1',
      playerId: 'player-1',
      roundId: 'round-1',
      kind: WagerTransactionKind.Loss,
      money: Money.create('10.00', 'BRL'),
    });
    transaction.markProcessed();

    const event = transactionEvent(transaction, 'WagerTransactionProcessed');

    expect(event).toMatchObject({
      eventId: 'WagerTransactionProcessed:tx-1',
      eventType: 'WagerTransactionProcessed',
      aggregateId: 'tx-1',
      version: 1,
    });
    expect(event.data.money).toEqual({ amount: '10.00', currency: 'BRL' });
  });
});
