import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { EntityManager as MikroEntityManager } from '@mikro-orm/core';
import { Inject } from '@nestjs/common';
import type { EntityManager } from '@mikro-orm/postgresql';
import { OutboxMessageEntity } from '../../persistence/mikro-orm/entities/outbox-message.entity.js';
import { QueueConfiguration } from './queue-configuration.js';
import { SqsClientFactory } from './sqs.client.js';
import { MetricsService } from '../../observability/metrics.service.js';
import { StructuredLogger, errorMessage } from '../../observability/structured-logger.js';

@Injectable()
export class WagerTransactionPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new StructuredLogger(WagerTransactionPublisher.name);
  private running = false;
  private eventsQueueUrl?: string;
  private pollTask?: Promise<void>;
  constructor(
    @Inject(MikroEntityManager) private readonly em: EntityManager,
    private readonly sqs: SqsClientFactory,
    private readonly queues: QueueConfiguration,
    @Optional() private readonly metrics: MetricsService = new MetricsService(),
  ) {}

  async onModuleInit(): Promise<void> { if (process.env.SQS_PUBLISHER_ENABLED === 'true') { this.running = true; this.pollTask = this.poll(); } }
  async onModuleDestroy(): Promise<void> { this.running = false; await this.pollTask; }

  private async poll(): Promise<void> {
    while (this.running) {
      let published = false;
      try {
        if (!this.eventsQueueUrl) this.eventsQueueUrl = await this.sqs.queueUrl(this.queues.eventsQueue);
        published = await this.publishBatch();
      } catch (error) {
        this.eventsQueueUrl = undefined;
        this.logger.error('outbox_poll_failed', { error: errorMessage(error) });
      }
      if (!published) await new Promise((resolve) => setTimeout(resolve, this.queues.outboxPollIntervalMs));
    }
  }

  async publishOnce(): Promise<boolean> {
    return this.publishBatch();
  }

  private async publishBatch(): Promise<boolean> {
    const message = await this.em.transactional(async (em) => {
      const rows = await em.getConnection().execute<OutboxMessageEntity[]>(`select id, payload, aggregate_id as "aggregateId", attempts from outbox_messages where status = 'PENDING' or (status = 'PUBLISHING' and locked_at < now() - (? * interval '1 millisecond')) order by created_at for update skip locked limit 1`, [this.queues.outboxLockTimeoutMs]);
      const row = rows[0];
      if (!row) {
        this.metrics.setGauge('wager_outbox_lag_seconds', 0);
        return undefined;
      }
      await em.getConnection().execute(`update outbox_messages set status = 'PUBLISHING', locked_at = now(), attempts = attempts + 1 where id = ?`, [row.id]);
      return row;
    });
    if (!message) return false;
    this.metrics.outboxLag(new Date(message.createdAt));
    const data = (message.payload as { data?: Record<string, unknown> }).data ?? {};
    const context = {
      outboxId: message.id,
      transactionId: typeof data.transactionId === 'string' ? data.transactionId : undefined,
      walletId: typeof data.walletId === 'string' ? data.walletId : undefined,
      providerId: typeof data.providerId === 'string' ? data.providerId : undefined,
      correlationId: typeof (message.payload as { correlationId?: unknown }).correlationId === 'string'
        ? (message.payload as { correlationId: string }).correlationId
        : undefined,
    };
    try {
      await this.sqs.client.send(new SendMessageCommand({ QueueUrl: this.eventsQueueUrl, MessageBody: JSON.stringify(message.payload), MessageGroupId: message.aggregateId, MessageDeduplicationId: message.id }));
      await this.em.nativeUpdate(OutboxMessageEntity, { id: message.id }, { status: 'PUBLISHED', publishedAt: new Date(), lockedAt: null });
      this.logger.log('outbox_message_published', context);
    } catch (error) {
      const attempts = Number(message.attempts ?? 0) + 1;
      try {
        await this.em.nativeUpdate(OutboxMessageEntity, { id: message.id }, {
          status: attempts >= this.queues.outboxMaxAttempts ? 'FAILED' : 'PENDING',
          lastError: errorMessage(error),
          lockedAt: null,
        });
      } catch (updateError) {
        this.logger.error('outbox_state_update_failed', { ...context, error: errorMessage(updateError) });
      }
      if (attempts < this.queues.outboxMaxAttempts) this.metrics.retry('outbox_publisher');
      else this.metrics.increment('wager_outbox_failed_total');
      this.logger.error('outbox_publish_failed', { ...context, attempts, error: errorMessage(error) });
    }
    return true;
  }
}