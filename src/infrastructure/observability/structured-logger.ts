import { observabilityContext, type ObservabilityContext } from './request-context.js';

type LogFields = ObservabilityContext & Record<string, unknown>;

export class StructuredLogger {
  constructor(private readonly context: string) {}

  log(event: string, fields: Record<string, unknown> = {}): void {
    this.write('info', event, fields);
  }

  warn(event: string, fields: Record<string, unknown> = {}): void {
    this.write('warn', event, fields);
  }

  error(event: string, fields: Record<string, unknown> = {}): void {
    this.write('error', event, fields);
  }

  private write(level: string, event: string, fields: Record<string, unknown>): void {
    const context = observabilityContext();
    const payload: LogFields = { timestamp: new Date().toISOString(), level, logger: this.context, event, ...context, ...fields };
    const line = `${JSON.stringify(payload)}\n`;
    if (level === 'error') process.stderr.write(line);
    else process.stdout.write(line);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
