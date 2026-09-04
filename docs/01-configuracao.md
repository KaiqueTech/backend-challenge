# Configuracao e execucao

## Pre-requisitos

- Windows PowerShell.
- Docker Desktop em execucao.
- Bun 1.x.
- Portas `3000`, `5432` e `4566` livres.

## 1. Instalar dependencias

Na raiz do projeto:

```powershell
bun install
```

## 2. Configurar o ambiente

O arquivo `.env` e usado pela API e pelo Docker Compose. O `.env.example` contem somente os nomes das variaveis.

Para um ambiente local funcional, use estes valores no `.env`:

```env
NODE_ENV=development
PORT=3000
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=wagering
DATABASE_USER=wagering
DATABASE_PASSWORD=wagering
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_ENDPOINT_URL=http://localhost:4566
SQS_WAGER_TRANSACTIONS_QUEUE=wager-transactions.fifo
SQS_WAGER_TRANSACTIONS_DLQ=wager-transactions-dlq.fifo
SQS_EVENTS_QUEUE=wager-events.fifo
SQS_CONSUMER_ENABLED=true
SQS_PUBLISHER_ENABLED=true
SQS_VISIBILITY_TIMEOUT=30
SQS_RECEIVE_WAIT_SECONDS=1
SQS_MAX_ATTEMPTS=5
OUTBOX_POLL_INTERVAL_MS=1000
```

Nao use credenciais reais no LocalStack. O arquivo `.env` nao deve ser versionado.

## 3. Subir PostgreSQL e LocalStack

```powershell
docker compose up -d
```

Verifique o estado:

```powershell
docker compose ps
```

Os containers esperados sao `jungle-postgres` e `localstack`.

## 4. Aplicar migrations

```powershell
bunx mikro-orm migration:up
```

As migrations criam wallets, transactions, ledger, inbox, outbox e a protecao append-only do ledger.

## 5. Iniciar a API

```powershell
bun run start:dev
```

A aplicacao ficara em `http://localhost:3000`.

Para encerrar, pressione `Ctrl+C`. O Nest envia shutdown aos workers; mensagens nao commitadas nao devem ser ACKadas.

## Ordem de inicializacao

1. Docker inicia PostgreSQL e LocalStack.
2. Migrations criam o schema.
3. Nest abre a conexao com PostgreSQL.
4. Consumer e publisher SQS iniciam quando habilitados.
5. A API fica disponivel.
