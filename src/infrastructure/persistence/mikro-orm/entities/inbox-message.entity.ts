import { EntitySchema } from '@mikro-orm/core';

export class InboxMessageEntity {
  id!: string;
  consumerName!: string;
  messageId!: string;
  receivedAt!: Date;
  processedAt?: Date;
  status!: string;
  retryCount!: number;
  errorMessage?: string;
}

export const InboxMessageSchema = new EntitySchema({
  class: InboxMessageEntity,
  tableName: 'inbox_messages',
  properties: {
    id: { type: String, primary: true },
    consumerName: { type: String, fieldName: 'consumer_name' },
    messageId: { type: String, fieldName: 'message_id' },
    receivedAt: { type: Date, fieldName: 'received_at' },
    processedAt: { type: Date, fieldName: 'processed_at', nullable: true },
    status: { type: String },
    retryCount: { type: Number, fieldName: 'retry_count' },
    errorMessage: { type: String, fieldName: 'error_message', nullable: true },
  },
  uniques: [{ name: 'uq_inbox_consumer_message', properties: ['consumerName', 'messageId'] }],
});