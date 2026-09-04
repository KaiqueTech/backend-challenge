export class Migration20260903000200 {
  name = 'Migration20260903000200';
  private queries: string[] = [];

  async up(): Promise<void> {
    this.queries.push(`create table "inbox_messages" ("id" varchar(255) not null, "consumer_name" varchar(255) not null, "message_id" varchar(255) not null, "received_at" timestamptz not null, "processed_at" timestamptz null, "status" varchar(32) not null, "retry_count" int not null default 0, "error_message" text null, constraint "inbox_messages_pkey" primary key ("id"));`);
    this.queries.push(`create unique index "uq_inbox_consumer_message" on "inbox_messages" ("consumer_name", "message_id");`);
    this.queries.push(`create table "outbox_messages" ("id" varchar(255) not null, "event_type" varchar(128) not null, "event_version" int not null, "aggregate_type" varchar(128) not null, "aggregate_id" varchar(255) not null, "payload" jsonb not null, "occurred_at" timestamptz not null, "published_at" timestamptz null, "status" varchar(32) not null, "attempts" int not null default 0, "last_error" text null, "created_at" timestamptz not null, "locked_at" timestamptz null, constraint "outbox_messages_pkey" primary key ("id"));`);
    this.queries.push(`create index "ix_outbox_pending" on "outbox_messages" ("status", "created_at");`);
  }

  async down(): Promise<void> {
    this.queries.push('drop table if exists "outbox_messages" cascade;');
    this.queries.push('drop table if exists "inbox_messages" cascade;');
  }

  isTransactional(): boolean { return true; }
  reset(): void { this.queries = []; }
  setTransactionContext(_context: unknown): void {}
  getQueries(): string[] { return this.queries; }
}