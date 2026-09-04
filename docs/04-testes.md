# Testes

Execute os comandos na raiz do projeto.

## Testes unitarios e integracao padrao

```powershell
$env:RUN_INTEGRATION_TESTS='1'
bun test
```

A integracao usa PostgreSQL real quando `RUN_INTEGRATION_TESTS=1`.

## Testes de integracao

```powershell
bun run test:integration
```

Cobre persistencia, concorrencia, Inbox, Outbox, redelivery, ledger imutavel e pending reference.

Inclui recuperação após commit sem ACK, três conexões ORM concorrentes, publishers concorrentes da outbox e expiração de referências pendentes.

## Testes de concorrencia

```powershell
bun run test:concurrency
```

Cobre:

- duas apostas concorrentes;
- 50 BETs de `10.00`;
- 50 entregas da mesma operacao;
- uma unica alteracao financeira para duplicatas;
- consistencia do saldo.
- três instâncias ORM independentes disputando a mesma wallet;
- limite/TTL de `PENDING_REFERENCE` com transição para `FAILED`.

### Processos separados

```powershell
bun run test:processes
```

O teste inicia três processos Bun independentes (cada um com sua própria conexão ORM) e valida o saldo/ledger no PostgreSQL compartilhado. O teste requer PostgreSQL disponível e `bun` no `PATH`.

## Testes de mensageria

```powershell
bun run test:messaging
```

Usa LocalStack real e verifica:

- filas FIFO;
- redrive para DLQ;
- `MessageGroupId`;
- `MessageDeduplicationId`;
- envio, recebimento e delete.

Os testes unitários de resiliência também injetam indisponibilidade temporária de PostgreSQL e SQS durante o processamento/ACK.

### Observabilidade

Com a aplicação em execução, consulte `GET /metrics` para a exposição Prometheus. Os logs são uma linha JSON por evento e propagam `correlationId` no HTTP e `messageId`, `transactionId`, `walletId` e `providerId` quando disponíveis.

## Testes HTTP

```powershell
bun run test:e2e
```

Cobre wallet, BET, replay, ledger, consultas e reconcilicao.

## Build e lint

```powershell
bun run build
bun run lint
docker compose config
```

## Resultado esperado

Os comandos devem terminar com exit code `0`. Falhas devem ser investigadas; nao ignore erros de integracao apenas removendo `RUN_INTEGRATION_TESTS`.
