import { DeleteMessageCommand, GetQueueAttributesCommand, GetQueueUrlCommand, ReceiveMessageCommand, SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { describe, expect, it } from 'vitest';

const integration = process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;
const client = new SQSClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566',
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test' },
});

async function queueUrl(queueName: string): Promise<string> {
  const response = await client.send(new GetQueueUrlCommand({ QueueName: queueName }));
  if (!response.QueueUrl) throw new Error(`Queue not found: ${queueName}`);
  return response.QueueUrl;
}

integration('SQS LocalStack', () => {
  it('has FIFO queues and a configured redrive policy', async () => {
    const url = await queueUrl(process.env.SQS_WAGER_TRANSACTIONS_QUEUE ?? 'wager-transactions.fifo');
    const response = await client.send(new GetQueueAttributesCommand({ QueueUrl: url, AttributeNames: ['All'] }));
    expect(response.Attributes?.FifoQueue).toBe('true');
    expect(response.Attributes?.ContentBasedDeduplication).toBe('true');
    const redrive = JSON.parse(response.Attributes?.RedrivePolicy ?? '{}') as { deadLetterTargetArn?: string; maxReceiveCount?: string };
    expect(redrive.deadLetterTargetArn).toContain('wager-transactions-dlq.fifo');
    expect(Number(redrive.maxReceiveCount)).toBeGreaterThan(0);
  });

  it('sends, receives and acknowledges a FIFO message', async () => {
    const url = await queueUrl(process.env.SQS_WAGER_TRANSACTIONS_QUEUE ?? 'wager-transactions.fifo');
    const messageId = `integration-sqs-${Date.now()}`;
    await client.send(new SendMessageCommand({ QueueUrl: url, MessageBody: JSON.stringify({ messageId, type: 'WagerTransactionRequested', data: { test: true } }), MessageGroupId: 'integration-group', MessageDeduplicationId: messageId }));
    const response = await client.send(new ReceiveMessageCommand({ QueueUrl: url, WaitTimeSeconds: 2, MaxNumberOfMessages: 10 }));
    const message = response.Messages?.find((candidate) => candidate.Body?.includes(messageId));
    expect(message?.ReceiptHandle).toBeTruthy();
    await client.send(new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: message!.ReceiptHandle }));
  });
});
