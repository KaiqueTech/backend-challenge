import { DeleteMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { describe, expect, it, vi } from 'vitest';
import { WagerTransactionConsumer } from './wager-transaction.consumer.js';
import { MetricsService } from '../../observability/metrics.service.js';

function message(id = 'message-1') {
  return {
    MessageId: id,
    ReceiptHandle: `receipt-${id}`,
    Body: JSON.stringify({
      messageId: id,
      data: {
        id: 'transaction-1',
        providerId: 'provider-1',
        externalTransactionId: 'external-1',
        idempotencyKey: 'key-1',
        playerId: 'player-1',
        walletId: 'wallet-1',
        roundId: 'round-1',
        kind: 'BET',
        money: { amount: '1.00', currency: 'BRL' },
        payloadHash: 'hash-1',
      },
    }),
    Attributes: { ApproximateReceiveCount: '1' },
  };
}

function consumer(send: (command: unknown) => Promise<unknown>, processMessage: (id: string) => Promise<unknown>) {
  const instance = new WagerTransactionConsumer(
    { client: { send } } as never,
    { maxAttempts: 3, visibilityTimeout: 30 } as never,
    { processMessage: async (id: string) => processMessage(id) } as never,
  );
  (instance as unknown as { queueUrl: string }).queueUrl = 'queue-url';
  return instance;
}

describe('WagerTransactionConsumer resilience', () => {
  it('reprocesses a committed message after a crash before ACK without duplicating its effect', async () => {
    const sent: unknown[] = [];
    let committed = false;
    let effects = 0;
    let firstDelete = true;
    const send = vi.fn(async (command: unknown) => {
      sent.push(command);
      if (command instanceof DeleteMessageCommand && firstDelete) {
        firstDelete = false;
        throw new Error('process crashed after database commit');
      }
      return {};
    });
    const processMessage = vi.fn(async (id: string) => {
      if (!committed) {
        committed = true;
        effects += 1;
      }
      return { id };
    });
    const instance = consumer(send, processMessage);

    await instance.handleMessage(message());
    await instance.handleMessage(message());

    expect(effects).toBe(1);
    expect(processMessage).toHaveBeenCalledTimes(2);
    expect(sent.filter((command) => command instanceof DeleteMessageCommand)).toHaveLength(2);
    expect(sent.filter((command) => command instanceof ChangeMessageVisibilityCommand)).toHaveLength(1);
  });

  it('keeps a message retryable when PostgreSQL is temporarily unavailable', async () => {
    let failures = 0;
    const send = vi.fn(async () => ({}));
    const processMessage = vi.fn(async () => {
      if (failures++ === 0) throw new Error('ECONNREFUSED PostgreSQL');
      return {};
    });
    const instance = consumer(send, processMessage);

    await instance.handleMessage(message('postgres-retry'));
    await instance.handleMessage(message('postgres-retry'));

    expect(processMessage).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.some(([command]) => command instanceof ChangeMessageVisibilityCommand)).toBe(true);
    expect(send.mock.calls.some(([command]) => command instanceof DeleteMessageCommand)).toBe(true);
  });

  it('does not lose a committed message when SQS is temporarily unavailable for ACK', async () => {
    let deleteFailures = 1;
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof DeleteMessageCommand && deleteFailures-- > 0) {
        throw new Error('ServiceUnavailable from SQS');
      }
      return {};
    });
    const instance = consumer(send, vi.fn(async () => ({})));

    await instance.handleMessage(message('sqs-retry'));
    await instance.handleMessage(message('sqs-retry'));

    expect(send.mock.calls.filter(([command]) => command instanceof DeleteMessageCommand)).toHaveLength(2);
    expect(send.mock.calls.some(([command]) => command instanceof ChangeMessageVisibilityCommand)).toBe(true);
  });

  it('records DLQ eligibility after the configured receive limit', async () => {
    const metrics = new MetricsService();
    const send = vi.fn(async () => ({}));
    const instance = new WagerTransactionConsumer(
      { client: { send } } as never,
      { maxAttempts: 3, visibilityTimeout: 30 } as never,
      { processMessage: async () => { throw new Error('ECONNREFUSED PostgreSQL'); } } as never,
      metrics,
    );
    (instance as unknown as { queueUrl: string }).queueUrl = 'queue-url';

    await instance.handleMessage({ ...message('dlq-message'), Attributes: { ApproximateReceiveCount: '3' } });

    expect(send.mock.calls.some(([command]) => command instanceof ChangeMessageVisibilityCommand)).toBe(false);
    expect(metrics.renderPrometheus()).toContain('wager_dlq_messages_total 1');
  });
});
