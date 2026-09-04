import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import mikroOrmConfig from './mikro-orm.config.js';
  import { WalletRepository, WagerTransactionRepository } from './infrastructure/persistence/mikro-orm/repositories/persistence-repositories.js';
  import { WageringPersistenceService } from './infrastructure/persistence/mikro-orm/wagering-persistence.service.js';
  import { QueueConfiguration } from './infrastructure/messaging/sqs/queue-configuration.js';
  import { SqsClientFactory } from './infrastructure/messaging/sqs/sqs.client.js';
  import { WagerTransactionConsumer } from './infrastructure/messaging/sqs/wager-transaction.consumer.js';
  import { WagerTransactionPublisher } from './infrastructure/messaging/sqs/wager-transaction.publisher.js';
  import { PendingReferenceWorker } from './infrastructure/messaging/sqs/pending-reference.worker.js';
  import { WalletController } from './api/controllers/wallet.controller.js';
  import { WageringController } from './api/controllers/wagering.controller.js';
  import { TransactionController } from './api/controllers/transaction.controller.js';
  import { HealthController } from './api/controllers/health.controller.js';
  import { MetricsController } from './api/controllers/metrics.controller.js';
  import { MetricsService } from './infrastructure/observability/metrics.service.js';
  import { RootController } from './api/controllers/root.controller.js';
  import { CorrelationMiddleware } from './infrastructure/observability/correlation.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    MikroOrmModule.forRoot(mikroOrmConfig),
  ],
  controllers: [RootController, WalletController, WageringController, TransactionController, HealthController, MetricsController],
  providers: [MetricsService, WalletRepository, WagerTransactionRepository, WageringPersistenceService, QueueConfiguration, SqsClientFactory, WagerTransactionConsumer, WagerTransactionPublisher, PendingReferenceWorker],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}