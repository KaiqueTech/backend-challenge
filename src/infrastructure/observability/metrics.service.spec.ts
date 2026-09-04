import { describe, expect, it } from 'vitest';
import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  it('renders the required counters, gauges and latency summary', () => {
    const metrics = new MetricsService();
    metrics.transactionStatus('PROCESSED');
    metrics.duplicateDetected();
    metrics.retry('sqs_consumer');
    metrics.dlqMessage();
    metrics.lockConflict();
    metrics.outboxLag(new Date(Date.now() - 1000));
    metrics.processingLatency(25);

    const output = metrics.renderPrometheus();
    expect(output).toContain('wager_transactions_total{status="PROCESSED"} 1');
    expect(output).toContain('wager_duplicates_total 1');
    expect(output).toContain('wager_retries_total{component="sqs_consumer"} 1');
    expect(output).toContain('wager_dlq_messages_total 1');
    expect(output).toContain('wager_lock_conflicts_total 1');
    expect(output).toContain('wager_outbox_lag_seconds');
    expect(output).toContain('wager_processing_latency_seconds_count 1');
  });
});
