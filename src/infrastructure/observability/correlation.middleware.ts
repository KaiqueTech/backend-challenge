import { Injectable, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { withObservabilityContext } from './request-context.js';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const correlationId = request.header('x-correlation-id') ?? randomUUID();
    response.setHeader('x-correlation-id', correlationId);
    withObservabilityContext({ correlationId }, next);
  }
}
