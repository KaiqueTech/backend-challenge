# Arquitetura e responsabilidades

## Visao geral

```text
HTTP ou SQS
    |
    v
Controller / Consumer
    |
    v
WageringPersistenceService
    |
    +--> Wallet e regras de dominio
    +--> WagerTransactionProcessor
    +--> Ledger
    +--> Inbox
    +--> Outbox
    |
    v
PostgreSQL
    |
    v
Outbox Publisher ---> SQS de eventos
```

## Camadas

### `src/domain/entities`

Contem as regras financeiras puras:

- `Money`: valores decimais exatos, sempre como string na entrada e saida.
- `Wallet`: saldo, moeda, version e debito/credito.
- `WagerTransaction`: estados e identidade da operacao.
- `WagerTransactionProcessor`: BET, WIN, LOSS, REFUND e ROLLBACK.
- `WalletLedgerEntry`: lancamento imutavel e balanceado.

### `src/application`

Contem ports, comandos, hash canonico e eventos. O `payloadHash` ignora headers e metadados de transporte.

### `src/infrastructure/persistence`

Contem MikroORM, PostgreSQL, repositories, mappers e migrations.

- Wallet e ledger usam lock pessimista por wallet.
- Inbox usa unicidade `consumer_name + message_id`.
- Outbox grava eventos na mesma transacao financeira.
- Trigger PostgreSQL impede update/delete de ledger.

### `src/infrastructure/messaging/sqs`

- `SqsClientFactory`: cliente AWS SDK e resolucao de URLs.
- `WagerTransactionConsumer`: long polling, processamento e ACK apos commit.
- `WagerTransactionPublisher`: claim concorrente da Outbox com `SKIP LOCKED`.
- `PendingReferenceWorker`: tenta novamente referencias fora de ordem.
- `retry-policy`: classifica erros e calcula backoff.

### `src/http`

Controllers finos, DTOs, validacao, Swagger, serializacao e filtro de erros HTTP.

## Fluxo financeiro

1. A mensagem ou request e convertido em `WagerTransaction`.
2. A wallet e bloqueada no PostgreSQL.
3. O dominio aplica a operacao.
4. Wallet, wager, ledger e Outbox sao persistidos na mesma transacao.
5. A transacao faz commit.
6. Somente depois o consumer remove a mensagem do SQS.

## Idempotencia

A idempotencia financeira nao depende de FIFO nem de memoria:

- HTTP: `providerId + idempotencyKey`.
- SQS: `consumerName + messageId` na Inbox.
- PostgreSQL aplica as constraints unicas.

## Outbox

O fluxo financeiro nao publica diretamente no SQS. O evento fica pendente no PostgreSQL. O publisher reivindica uma linha com `FOR UPDATE SKIP LOCKED`, publica no SQS e marca como `PUBLISHED`.

## Eventos

Os eventos atuais sao:

- `WagerTransactionProcessed`
- `WagerTransactionRejected`
- `WagerTransactionPendingReference`
- `WalletBalanceChanged`, somente quando o saldo muda.
