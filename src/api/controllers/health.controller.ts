import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { EntityManager as MikroEntityManager } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { SqsClientFactory } from '../../infrastructure/messaging/sqs/sqs.client.js';
import { QueueConfiguration } from '../../infrastructure/messaging/sqs/queue-configuration.js';
import { StructuredLogger, errorMessage } from '../../infrastructure/observability/structured-logger.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new StructuredLogger(HealthController.name);

  constructor(@Inject(MikroEntityManager) private readonly em: EntityManager, private readonly sqs: SqsClientFactory, private readonly queues: QueueConfiguration) {}

  @Get('live')
  live() { return { status: 'ok' }; }

  @Get('ready')
  async ready() {
    try {
      await this.em.getConnection().execute('select 1');
      await this.sqs.queueUrl(this.queues.wagerQueue);
      return { status: 'ok', dependencies: { postgres: 'ok', sqs: 'ok' } };
    } catch (error) {
      this.logger.error('health_readiness_failed', { error: errorMessage(error) });
      throw new ServiceUnavailableException({ status: 'unavailable', dependencies: { postgres: 'unknown', sqs: 'unknown' } });
    }
  }
}