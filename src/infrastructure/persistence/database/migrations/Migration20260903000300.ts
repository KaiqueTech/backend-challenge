export class Migration20260903000300 {
  name = 'Migration20260903000300';
  private queries: string[] = [];

  async up(): Promise<void> {
    this.queries.push(`create or replace function prevent_ledger_mutation() returns trigger language plpgsql as $$ begin raise exception 'ledger_entries are append-only'; end; $$;`);
    this.queries.push(`create trigger ledger_entries_append_only before update or delete on ledger_entries for each row execute function prevent_ledger_mutation();`);
  }

  async down(): Promise<void> {
    this.queries.push(`drop trigger if exists ledger_entries_append_only on ledger_entries;`);
    this.queries.push(`drop function if exists prevent_ledger_mutation();`);
  }

  isTransactional(): boolean { return true; }
  reset(): void { this.queries = []; }
  setTransactionContext(_context: unknown): void {}
  getQueries(): string[] { return this.queries; }
}