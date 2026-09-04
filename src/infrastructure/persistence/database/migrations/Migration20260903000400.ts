export class Migration20260903000400 {
  name = 'Migration20260903000400';
  private queries: string[] = [];

  async up(): Promise<void> {
    this.queries.push(`alter table "wager_transactions" add column if not exists "pending_reference_attempts" int not null default 0;`);
    this.queries.push(`alter table "wager_transactions" add column if not exists "pending_reference_since" timestamptz null;`);
    this.queries.push(`create index if not exists "ix_wager_pending_reference" on "wager_transactions" ("status", "pending_reference_since");`);
  }

  async down(): Promise<void> {
    this.queries.push(`drop index if exists "ix_wager_pending_reference";`);
    this.queries.push(`alter table "wager_transactions" drop column if exists "pending_reference_since";`);
    this.queries.push(`alter table "wager_transactions" drop column if exists "pending_reference_attempts";`);
  }

  isTransactional(): boolean { return true; }
  reset(): void { this.queries = []; }
  setTransactionContext(_context: unknown): void {}
  getQueries(): string[] { return this.queries; }
}
