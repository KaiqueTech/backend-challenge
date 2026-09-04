# API e Swagger

## Abrir Swagger

Com a API rodando, abra:

```text
http://localhost:3000/docs
```

No Swagger, clique em `Try it out`, preencha o body e execute. Para wagering, adicione o header `Idempotency-Key`.

## Health

### Liveness

```http
GET /health/live
```

Esperado:

```json
{"status":"ok"}
```

### Readiness

```http
GET /health/ready
```

Esperado:

```json
{"status":"ok","dependencies":{"postgres":"ok","sqs":"ok"}}
```

## Criar wallet

```http
POST /wallets
```

Body:

```json
{
  "playerId": "player-manual",
  "initialBalance": { "amount": "100.00", "currency": "BRL" }
}
```

Esperado: HTTP `201`, um `id` novo, `balance: "100.00"` e `version: 1`.

O saldo inicial cria uma operacao interna `OPENING` e um credito no ledger.

## Consultar wallet

```http
GET /wallets/{walletId}
```

Confirme `playerId`, `currency`, saldo e version.

## Processar BET

```http
POST /wagering/transactions
Idempotency-Key: manual-key-1
```

Body:

```json
{
  "providerId": "provider-manual",
  "externalTransactionId": "bet-manual-1",
  "playerId": "player-manual",
  "walletId": "WALLET_ID",
  "roundId": "round-1",
  "gameId": "game-1",
  "kind": "BET",
  "money": { "amount": "80.00", "currency": "BRL" }
}
```

Substitua `WALLET_ID` pelo ID retornado na criacao. Esperado: HTTP `200`, `status: "PROCESSED"`, `balance: "20.00"` e `idempotentReplay: false`.

Nao envie `referenceExternalTransactionId` em BET.

## Replay e conflito

Repita o mesmo body e a mesma chave. Esperado:

- mesma `transactionId`;
- saldo continua `"20.00"`;
- `idempotentReplay: true`;
- nenhum novo debito.

Troque o amount para `50.00`, mantendo a chave. Esperado: HTTP `409` com `IDEMPOTENCY_CONFLICT`.

Sem o header `Idempotency-Key`, esperado: HTTP `400`.

## Outras operacoes

`WIN` cria credito; `LOSS` cria transacao sem alterar saldo; `REFUND` exige referencia de BET; `ROLLBACK` exige referencia valida. `REFUND` e `ROLLBACK` nao devem ser enviados sem `referenceExternalTransactionId`.

## Consultas

```http
GET /wallets/{walletId}/ledger?limit=50
GET /transactions/{transactionId}
GET /providers/{providerId}/transactions/{externalTransactionId}
POST /wallets/{walletId}/reconciliation
```

O ledger retorna cursor opaco em `nextCursor`. Use-o assim:

```http
GET /wallets/{walletId}/ledger?cursor=CURSOR_RETORNADO&limit=50
```

A reconcilicao deve retornar `consistent: true`, `difference: "0.00"` e saldo armazenado igual ao calculado.

## Rotas de transacao

As rotas implementadas atualmente sao `/transactions/...` e `/providers/.../transactions/...`. Elas nao possuem o prefixo `/wagering` descrito em uma parte do README.
