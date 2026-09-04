import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class QueueConfiguration {
  constructor(private readonly config: ConfigService) {}

  get region(): string { return this.config.get<string>('AWS_REGION', 'us-east-1'); }
  get endpoint(): string | undefined { return this.config.get<string>('AWS_ENDPOINT_URL'); }
  get wagerQueue(): string { return this.config.getOrThrow<string>('SQS_WAGER_TRANSACTIONS_QUEUE'); }
  get deadLetterQueue(): string { return this.config.getOrThrow<string>('SQS_WAGER_TRANSACTIONS_DLQ'); }
  get eventsQueue(): string { return this.config.get<string>('SQS_EVENTS_QUEUE', `${this.wagerQueue}-events`); }
  get visibilityTimeout(): number { return Number(this.config.get<string>('SQS_VISIBILITY_TIMEOUT', '30')); }
  get maxAttempts(): number { return Number(this.config.get<string>('SQS_MAX_ATTEMPTS', '5')); }
  get outboxPollIntervalMs(): number { return Number(this.config.get<string>('OUTBOX_POLL_INTERVAL_MS', '1000')); }
  get receiveWaitSeconds(): number { return Number(this.config.get<string>('SQS_RECEIVE_WAIT_SECONDS', '1')); }
  get pendingReferenceMaxAttempts(): number { return Number(this.config.get<string>('PENDING_REFERENCE_MAX_ATTEMPTS', '10')); }
  get pendingReferenceTtlMs(): number { return Number(this.config.get<string>('PENDING_REFERENCE_TTL_MS', String(24 * 60 * 60 * 1000))); }
  get outboxMaxAttempts(): number { return Number(this.config.get<string>('OUTBOX_MAX_ATTEMPTS', '20')); }
  get outboxLockTimeoutMs(): number { return Number(this.config.get<string>('OUTBOX_LOCK_TIMEOUT_MS', String(5 * 60 * 1000))); }
}