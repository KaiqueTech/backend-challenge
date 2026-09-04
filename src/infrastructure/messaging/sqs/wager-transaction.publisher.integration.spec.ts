import { DeleteMessageCommand, GetQueueUrlCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { MikroORM } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import config from '../../../mikro-orm.config.js';
import { WagerTransactionPublisher } from './wager-transaction.publisher.js';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;
const client = new SQSClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566',
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test' },
});

integration('concurrent outbox publishers', () => {
  it('claims an outbox row once when two publishers run concurrently', async () => {
    const [firstOrm, secondOrm] = await Promise.all([MikroORM.init(config), MikroORM.init(config)]);
    const id = `publisher-concurrency-${Date.now()}`;
    try {
      try {
        await firstOrm.migrator.up();
      } catch (error) {
        // Other integration files may migrate the shared database concurrently.
        if (!(error instanceof Error) || !error.message.includes('already exists')) throw error;
      }
      await firstOrm.em.getConnection().execute(`truncate table outbox_messages restart identity cascade`);
      const queueResponse = await client.send(new GetQueueUrlCommand({ QueueName: process.env.SQS_EVENTS_QUEUE ?? 'wager-events.fifo' }));
      const queueUrl = queueResponse.QueueUrl!;
      await firstOrm.em.getConnection().execute(
        `insert into outbox_messages (id, event_type, event_version, aggregate_type, aggregate_id, payload, occurred_at, status, attempts, created_at) values (?, 'IntegrationEvent', 1, 'WagerTransaction', ?, ?::jsonb, now(), 'PENDING', 0, now())`,
        [id, id, JSON.stringify({ eventId: id, eventType: 'IntegrationEvent', data: { id } })],
      );
      const queues = { outboxLockTimeoutMs: 300_000, outboxMaxAttempts: 3 } as never;
      const sqs = { client } as never;
      const first = new WagerTransactionPublisher(firstOrm.em.fork(), sqs, queues);
      const second = new WagerTransactionPublisher(secondOrm.em.fork(), sqs, queues);
      (first as unknown as { eventsQueueUrl: string }).eventsQueueUrl = queueUrl;
      (second as unknown as { eventsQueueUrl: string }).eventsQueueUrl = queueUrl;

      await Promise.all([first.publishOnce(), second.publishOnce()]);

      const rows = await firstOrm.em.getConnection().execute<{ status: string; attempts: string }[]>(
        `select status, attempts from outbox_messages where id = ?`,
        [id],
      );
      expect(rows[0]).toMatchObject({ status: 'PUBLISHED', attempts: 1 });
      let published;
      const deadline = Date.now() + 10_000;
      while (!published && Date.now() < deadline) {
        const received = await client.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 2, MaxNumberOfMessages: 10 }));
        published = received.Messages?.find((message) => message.Body?.includes(id));
      }
      expect(published?.ReceiptHandle).toBeTruthy();
      await client.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: published!.ReceiptHandle }));
      await firstOrm.em.getConnection().execute(`delete from outbox_messages where id = ?`, [id]);
    } finally {
      await Promise.all([firstOrm.close(true), secondOrm.close(true)]);
    }
  }, 15_000);
});
