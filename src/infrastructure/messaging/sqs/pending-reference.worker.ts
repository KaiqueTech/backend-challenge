import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { WageringPersistenceService } from '../../persistence/mikro-orm/wagering-persistence.service.js';
import { QueueConfiguration } from './queue-configuration.js';
import { MetricsService } from '../../observability/metrics.service.js';
import { StructuredLogger, errorMessage } from '../../observability/structured-logger.js';

@Injectable()
export class PendingReferenceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new StructuredLogger(PendingReferenceWorker.name);
  private running = false;
  private task?: Promise<void>;

  constructor(
    private readonly operations: WageringPersistenceService,
    private readonly queues: QueueConfiguration,
    @Optional() private readonly metrics: MetricsService = new MetricsService(),
  ) {}

  onModuleInit(): void {
    if (process.env.SQS_CONSUMER_ENABLED !== 'true') return;
    this.running = true;
    this.task = this.poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.task;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        await this.operations.reprocessPendingReferences(50, {
          maxAttempts: this.queues.pendingReferenceMaxAttempts,
          ttlMs: this.queues.pendingReferenceTtlMs,
        });
      } catch (error) {
        this.metrics.retry('pending_reference_worker');
        this.logger.error('pending_reference_reprocess_failed', { error: errorMessage(error) });
      }
      await new Promise((resolve) => setTimeout(resolve, this.queues.outboxPollIntervalMs));
    }
  }
}