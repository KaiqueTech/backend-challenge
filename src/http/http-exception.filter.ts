import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StructuredLogger, errorMessage } from '../infrastructure/observability/structured-logger.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new StructuredLogger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      this.logger.error('http_request_failed', { method: request.method, path: request.path, statusCode: status, error: exception.message });
      response.status(status).json({ statusCode: status, error: HttpStatus[status] ?? 'Error', message: exception.message });
      return;
    }
    const message = exception instanceof Error ? exception.message : String(exception);
    const mapping: Record<string, number> = {
      IDEMPOTENCY_CONFLICT: 409, INVALID_CURSOR: 400, INVALID_LIMIT: 400, 'Wallet not found': 404, 'Transaction not found': 404,
      'Wallet already exists': 409, 'Transaction reference is required': 400,
    };
    const status = Object.entries(mapping).find(([key]) => message.includes(key))?.[1] ?? (message.includes('duplicate key') ? 409 : message.includes('INSUFFICIENT_FUNDS') ? 422 : 500);
    this.logger.error('http_request_failed', { method: request.method, path: request.path, statusCode: status, error: errorMessage(exception) });
    response.status(status).json({ statusCode: status, error: HttpStatus[status] ?? 'Error', message: status === 500 ? 'Internal server error' : message });
  }
}
