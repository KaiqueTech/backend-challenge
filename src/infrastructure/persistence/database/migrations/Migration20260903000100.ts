export class Migration20260903000100 {
  name = 'Migration20260903000100';
  private queries: string[] = [];

  async up(): Promise<void> {
    this.queries.push(`create table "wallets" ("id" varchar(255) not null, "player_id" varchar(255) not null, "currency" varchar(3) not null, "balance" numeric(20, 2) not null default 0, "version" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, constraint "wallets_pkey" primary key ("id"));`);
    this.queries.push(`alter table "wallets" add constraint "wallets_balance_non_negative" check ("balance" >= 0), add constraint "wallets_version_positive" check ("version" >= 1), add constraint "wallets_currency_format" check ("currency" = upper("currency") and length("currency") = 3);`);
    this.queries.push(`create unique index "uq_wallet_player_currency" on "wallets" ("player_id", "currency");`);

    this.queries.push(`create table "wager_transactions" ("id" varchar(255) not null, "provider_id" varchar(255) not null, "external_transaction_id" varchar(255) not null, "idempotency_key" varchar(255) not null, "player_id" varchar(255) not null, "wallet_id" varchar(255) not null, "round_id" varchar(255) not null, "game_id" varchar(255) null, "type" varchar(32) not null, "status" varchar(32) not null, "amount" numeric(20, 2) not null, "currency" varchar(3) not null, "reference_transaction_id" varchar(255) null, "reference_external_transaction_id" varchar(255) null, "failure_code" varchar(64) null, "payload_hash" varchar(128) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "processed_at" timestamptz null, constraint "wager_transactions_pkey" primary key ("id"));`);
    this.queries.push(`alter table "wager_transactions" add constraint "wager_amount_positive" check ("amount" > 0), add constraint "wager_currency_format" check ("currency" = upper("currency") and length("currency") = 3), add constraint "wager_type_valid" check ("type" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')), add constraint "wager_status_valid" check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));`);
    this.queries.push(`create unique index "uq_wager_provider_external" on "wager_transactions" ("provider_id", "external_transaction_id");`);
    this.queries.push(`create unique index "uq_wager_provider_idempotency" on "wager_transactions" ("provider_id", "idempotency_key");`);
    this.queries.push(`create unique index "uq_wager_reversal_reference" on "wager_transactions" ("provider_id", "reference_transaction_id", "type") where "reference_transaction_id" is not null and "type" in ('REFUND', 'ROLLBACK');`);
    this.queries.push(`create index "ix_wager_wallet_status" on "wager_transactions" ("wallet_id", "status");`);
    this.queries.push(`alter table "wager_transactions" add constraint "fk_wager_wallet" foreign key ("wallet_id") references "wallets" ("id");`);

    this.queries.push(`create table "ledger_entries" ("id" varchar(255) not null, "wallet_id" varchar(255) not null, "transaction_id" varchar(255) not null, "type" varchar(16) not null, "amount" numeric(20, 2) not null, "balance_before" numeric(20, 2) not null, "balance_after" numeric(20, 2) not null, "currency" varchar(3) not null, "created_at" timestamptz not null, constraint "ledger_entries_pkey" primary key ("id"));`);
    this.queries.push(`alter table "ledger_entries" add constraint "ledger_amount_positive" check ("amount" > 0), add constraint "ledger_type_valid" check ("type" in ('DEBIT', 'CREDIT')), add constraint "ledger_balance_after_non_negative" check ("balance_after" >= 0);`);
    this.queries.push(`create unique index "uq_ledger_transaction_wallet" on "ledger_entries" ("transaction_id", "wallet_id");`);
    this.queries.push(`alter table "ledger_entries" add constraint "fk_ledger_wallet" foreign key ("wallet_id") references "wallets" ("id"), add constraint "fk_ledger_transaction" foreign key ("transaction_id") references "wager_transactions" ("id");`);
  }

  async down(): Promise<void> {
    this.queries.push('drop table if exists "ledger_entries" cascade;');
    this.queries.push('drop table if exists "wager_transactions" cascade;');
    this.queries.push('drop table if exists "wallets" cascade;');
  }

  isTransactional(): boolean { return true; }
  reset(): void { this.queries = []; }
  setTransactionContext(_context: unknown): void {}
  getQueries(): string[] { return this.queries; }
}