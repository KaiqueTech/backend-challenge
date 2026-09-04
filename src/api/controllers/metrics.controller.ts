import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MetricsService } from '../../infrastructure/observability/metrics.service.js';

@ApiTags('observability')
@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metricsEndpoint(): string {
    return this.metrics.renderPrometheus();
  }
}
