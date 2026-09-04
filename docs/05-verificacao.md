# Checklist de verificacao

## Infraestrutura

- [ ] `docker compose ps` mostra PostgreSQL e LocalStack ativos.
- [ ] `bunx mikro-orm migration:up` termina sem erro.
- [ ] `docker exec localstack awslocal sqs list-queues` mostra as filas de wager, DLQ e eventos.
- [ ] `GET /health/live` retorna `status: ok`.
- [ ] `GET /health/ready` retorna PostgreSQL e SQS como `ok`.
- [ ] `GET /metrics` retorna texto Prometheus com os contadores e gauges de observabilidade.

## Wallet

- [ ] Wallet nova retorna HTTP `201`.
- [ ] Saldo monetario aparece como string com duas casas.
- [ ] Version inicial e `1`.
- [ ] Wallet com saldo inicial possui `OPENING` e ledger `CREDIT`.
- [ ] Wallet inexistente retorna `404`.

## Wager

- [ ] BET valida retorna `PROCESSED`.
- [ ] BET de `80.00` em saldo `100.00` deixa saldo `20.00`.
- [ ] BET sem `Idempotency-Key` retorna `400`.
- [ ] Replay identico retorna a mesma transacao.
- [ ] Mesma chave com payload diferente retorna `409`.
- [ ] BET nao inclui referencia.
- [ ] LOSS nao altera saldo nem cria ledger.
- [ ] WIN cria credito.
- [ ] REFUND e ROLLBACK exigem referencia e nao duplicam reversao.

## Persistencia

Consulte o banco:

```powershell
docker exec jungle-postgres psql -U wagering -d wagering -c "select id, player_id, currency, balance, version from wallets;"
docker exec jungle-postgres psql -U wagering -d wagering -c "select id, wallet_id, transaction_id, type, amount, balance_before, balance_after from ledger_entries;"
docker exec jungle-postgres psql -U wagering -d wagering -c "select consumer_name, message_id, status, retry_count from inbox_messages;"
docker exec jungle-postgres psql -U wagering -d wagering -c "select id, event_type, status, attempts, published_at from outbox_messages;"
```

Observe:

- balance nunca negativo;
- saldo igual a reconstruicao do ledger;
- uma operacao nao gera debito duplicado;
- Inbox possui uma linha por consumidor e message ID;
- Outbox nasce `PENDING` e pode virar `PUBLISHED`.

## SQS manual

```powershell
docker exec localstack awslocal sqs list-queues
docker exec localstack awslocal sqs get-queue-attributes --queue-url http://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/wager-transactions.fifo --attribute-names All
```

Confirme `FifoQueue=true`, `ContentBasedDeduplication=true` e `RedrivePolicy` configurado.

## Troubleshooting

### `REFERENCE_MISMATCH`

O `playerId`, `walletId` ou currency da transacao nao coincide com a wallet. Consulte a wallet e use exatamente os valores retornados.

### `IDEMPOTENCY_CONFLICT`

A chave ja foi usada com outro payload. Use o mesmo payload original ou uma nova chave.

### Readiness indisponivel

Confira `docker compose ps`, logs e se as portas `5432` e `4566` estao acessiveis.

```powershell
docker compose logs postgres
docker compose logs localstack
```

### Migration ja aplicada

Isso e normal. O comando informa que o banco ja esta na ultima versao.

### Teste de integracao falhando por dados antigos

Os testes usam `TRUNCATE ... CASCADE` no fixture. Verifique se PostgreSQL esta disponivel e execute novamente.
