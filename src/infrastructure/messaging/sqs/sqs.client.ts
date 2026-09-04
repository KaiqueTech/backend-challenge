import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetQueueUrlCommand, SQSClient } from '@aws-sdk/client-sqs';
import { QueueConfiguration } from './queue-configuration.js';

@Injectable()
export class SqsClientFactory {
  readonly client: SQSClient;

  constructor(config: ConfigService, queues: QueueConfiguration) {
    this.client = new SQSClient({
      region: queues.region,
      endpoint: queues.endpoint,
      credentials: {
        accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID', 'test'),
        secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY', 'test'),
      },
    });
  }

  async queueUrl(queueName: string): Promise<string> {
    const response = await this.client.send(new GetQueueUrlCommand({ QueueName: queueName }));
    if (!response.QueueUrl) throw new Error(`SQS queue not found: ${queueName}`);
    return response.QueueUrl;
  }
}