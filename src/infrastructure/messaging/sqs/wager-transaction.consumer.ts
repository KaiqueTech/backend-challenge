import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { DeleteMessageCommand, ReceiveMessageCommand, ChangeMessageVisibilityCommand } from '@aws-sdk/client-sqs';
import { Money } from '../../../domain/entities/money/money.js';
import { WagerTransaction, WagerTransactionKind } from '../../../domain/entities/wagering/wager-transaction.js';
import { WageringPersistenceService } from '../../persistence/mikro-orm/wagering-persistence.service.js';
import { SqsClientFactory } from './sqs.client.js';
import { QueueConfiguration } from './queue-configuration.js';
import { classifyProcessingError, retryDelayMs } from './retry-policy.js';
import { payloadHash } from '../../../application/payload-hash.js';
import { MetricsService } from '../../observability/metrics.service.js';
import { withObservabilityContext } from '../../observability/request-context.js';
import { StructuredLogger, errorMessage } from '../../observability/structured-logger.js';

interface WagerMessage { messageId: string; data: Record<string, any> }

@Injectable()
export class WagerTransactionConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new StructuredLogger(WagerTransactionConsumer.name);
  private running = false;
  private active = new Set<Promise<void>>();
  private pollTask?: Promise<void>;
  private queueUrl?: string;

  constructor(
    private readonly sqs: SqsClientFactory,
    private readonly queues: QueueConfiguration,
    private readonly operations: WageringPersistenceService,
    @Optional() private readonly metrics: MetricsService = new MetricsService(),
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.SQS_CONSUMER_ENABLED !== 'true') return;
    this.running = true;
    this.pollTask = this.poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.pollTask;
    await Promise.allSettled(this.active);
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        if (!this.queueUrl) {
          this.queueUrl = await this.sqs.queueUrl(this.queues.wagerQueue);
        }
        const response = await this.sqs.client.send(new ReceiveMessageCommand({ QueueUrl: this.queueUrl, MaxNumberOfMessages: 10, WaitTimeSeconds: this.queues.receiveWaitSeconds, VisibilityTimeout: this.queues.visibilityTimeout, MessageSystemAttributeNames: ['ApproximateReceiveCount'] }));
        for (const message of response.Messages ?? []) {
          const task = this.handleMessage(message).finally(() => this.active.delete(task));
          this.active.add(task);
        }
      } catch (error) {
        this.queueUrl = undefined;
        this.logger.error('sqs_receive_failed', { error: errorMessage(error) });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async handleMessage(message: { MessageId?: string; ReceiptHandle?: string; Body?: string; Attributes?: Record<string, string> }): Promise<void> {
    const context = { messageId: message.MessageId };
    if (message.Body) {
      try {
        const parsed = JSON.parse(message.Body) as WagerMessage;
        Object.assign(context, {
          messageId: parsed.messageId ?? message.MessageId,
          transactionId: parsed.data?.id ?? parsed.messageId ?? message.MessageId,
          walletId: parsed.data?.walletId,
          providerId: parsed.data?.providerId,
        });
      } catch (error) {
        this.logger.warn('sqs_message_context_unavailable', { messageId: message.MessageId, error: errorMessage(error) });
      }
    }
    return withObservabilityContext(context, () => this.handleMessageInContext(message));
  }

  private async handleMessageInContext(message: { MessageId?: string; ReceiptHandle?: string; Body?: string; Attributes?: Record<string, string> }): Promise<void> {
    if (!message.Body || !message.ReceiptHandle) {
      this.logger.warn('sqs_message_invalid', { messageId: message.MessageId });
      return;
    }
    let messageId = message.MessageId;
    try {
      const parsed = JSON.parse(message.Body) as WagerMessage;
      messageId = parsed.messageId || message.MessageId;
      if (!messageId) {
        this.logger.warn('sqs_message_id_missing', {});
        return;
      }
      const data = parsed.data;
      const transaction = WagerTransaction.create({
        id: data.id ?? messageId,
        providerId: data.providerId,
        externalTransactionId: data.externalTransactionId,
        idempotencyKey: data.idempotencyKey,
        playerId: data.playerId,
        walletId: data.walletId,
        roundId: data.roundId,
        gameId: data.gameId,
        kind: data.kind ?? data.type as WagerTransactionKind,
        money: Money.create(data.money.amount, data.money.currency),
        referenceExternalTransactionId: data.referenceExternalTransactionId,
        payloadHash: data.payloadHash ?? payloadHash({ providerId: data.providerId, externalTransactionId: data.externalTransactionId, walletId: data.walletId, playerId: data.playerId, roundId: data.roundId, type: data.kind ?? data.type, amount: data.money.amount, currency: data.money.currency, referenceExternalTransactionId: data.referenceExternalTransactionId }),
      });
      await this.operations.processMessage(messageId, transaction);
      await this.sqs.client.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle }));
      this.logger.log('sqs_message_processed', {
        messageId,
        transactionId: transaction.id,
        walletId: transaction.walletId,
        providerId: transaction.providerId,
      });
    } catch (error) {
      const errorClass = classifyProcessingError(error);
      const attempt = Number(message.Attributes?.ApproximateReceiveCount ?? 1);
      const delay = retryDelayMs(attempt);
      this.logger.error('sqs_message_failed', {
        messageId,
        retryCount: attempt,
        errorClass,
        error: errorMessage(error),
      });
      try {
        if (errorClass === 'BUSINESS') {
          await this.sqs.client.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle }));
        } else if (attempt < this.queues.maxAttempts) {
          this.metrics.retry('sqs_consumer');
          await this.sqs.client.send(new ChangeMessageVisibilityCommand({ QueueUrl: this.queueUrl, ReceiptHandle: message.ReceiptHandle, VisibilityTimeout: Math.min(Math.max(1, Math.ceil(delay / 1000)), 43200) }));
        } else {
          this.metrics.dlqMessage();
          this.logger.error('sqs_message_dlq_eligible', { messageId, retryCount: attempt });
        }
      } catch (retryError) {
        // If SQS is unavailable, let the original visibility timeout/redrive policy recover it.
        this.metrics.retry('sqs_consumer_action');
        this.logger.error('sqs_retry_action_failed', { messageId, error: errorMessage(retryError) });
      }
    }
  }
}