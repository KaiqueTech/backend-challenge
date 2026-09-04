import { EntitySchema } from '@mikro-orm/core';

export class OutboxMessageEntity {
  id!: string;
  eventType!: string;
  eventVersion!: number;
  aggregateType!: string;
  aggregateId!: string;
  payload!: Record<string, unknown>;
  occurredAt!: Date;
  publishedAt?: Date;
  status!: string;
  attempts!: number;
  lastError?: string;
  createdAt!: Date;
  lockedAt?: Date;
}

export const OutboxMessageSchema = new EntitySchema({
  class: OutboxMessageEntity,
  tableName: 'outbox_messages',
  properties: {
    id: { type: String, primary: true },
    eventType: { type: String, fieldName: 'event_type' },
    eventVersion: { type: Number, fieldName: 'event_version' },
    aggregateType: { type: String, fieldName: 'aggregate_type' },
    aggregateId: { type: String, fieldName: 'aggregate_id' },
    payload: { type: 'json' },
    occurredAt: { type: Date, fieldName: 'occurred_at' },
    publishedAt: { type: Date, fieldName: 'published_at', nullable: true },
    status: { type: String },
    attempts: { type: Number },
    lastError: { type: String, fieldName: 'last_error', nullable: true },
    createdAt: { type: Date, fieldName: 'created_at' },
    lockedAt: { type: Date, fieldName: 'locked_at', nullable: true },
  },
  indexes: [{ name: 'ix_outbox_pending', properties: ['status', 'createdAt'] }],
});