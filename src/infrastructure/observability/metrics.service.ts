import { Injectable } from '@nestjs/common';

type Labels = Record<string, string>;

function key(labels: Labels): string {
  return Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)).map(([name, value]) => `${name}=${value}`).join(',');
}

function labelsText(labels: Labels): string {
  const entries = Object.entries(labels);
  return entries.length === 0 ? '' : `{${entries.map(([name, value]) => `${name}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')}}`;
}

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, Map<string, number>>();
  private readonly gauges = new Map<string, Map<string, number>>();
  private latencyCount = 0;
  private latencySum = 0;

  increment(name: string, labels: Labels = {}, value = 1): void {
    const values = this.counters.get(name) ?? new Map<string, number>();
    values.set(key(labels), (values.get(key(labels)) ?? 0) + value);
    this.counters.set(name, values);
  }

  setGauge(name: string, value: number, labels: Labels = {}): void {
    const values = this.gauges.get(name) ?? new Map<string, number>();
    values.set(key(labels), value);
    this.gauges.set(name, values);
  }

  transactionStatus(status: string): void {
    this.increment('wager_transactions_total', { status });
  }

  duplicateDetected(): void {
    this.increment('wager_duplicates_total');
  }

  retry(component: string): void {
    this.increment('wager_retries_total', { component });
  }

  dlqMessage(): void {
    this.increment('wager_dlq_messages_total');
  }

  lockConflict(): void {
    this.increment('wager_lock_conflicts_total');
  }

  processingLatency(durationMs: number): void {
    this.latencyCount += 1;
    this.latencySum += durationMs / 1000;
  }

  outboxLag(createdAt: Date): void {
    this.setGauge('wager_outbox_lag_seconds', Math.max(0, (Date.now() - createdAt.getTime()) / 1000));
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    for (const [name, values] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      for (const [serializedLabels, value] of values) lines.push(`${name}${labelsText(this.parseLabels(serializedLabels))} ${value}`);
    }
    for (const [name, values] of this.gauges) {
      lines.push(`# TYPE ${name} gauge`);
      for (const [serializedLabels, value] of values) lines.push(`${name}${labelsText(this.parseLabels(serializedLabels))} ${value}`);
    }
    lines.push('# TYPE wager_processing_latency_seconds summary');
    lines.push(`wager_processing_latency_seconds_count ${this.latencyCount}`);
    lines.push(`wager_processing_latency_seconds_sum ${this.latencySum}`);
    return `${lines.join('\n')}\n`;
  }

  private parseLabels(serializedLabels: string): Labels {
    if (!serializedLabels) return {};
    return Object.fromEntries(serializedLabels.split(',').map((entry) => {
      const separator = entry.indexOf('=');
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }));
  }
}
