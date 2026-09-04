# Status atual e limites

## Validado

- Build TypeScript/Nest.
- Lint.
- Docker Compose.
- PostgreSQL real.
- LocalStack real.
- Concorrencia de duas apostas.
- 50 BETs concorrentes.
- 50 duplicatas da mesma operacao.
- Inbox e redelivery no servico.
- Outbox atomica.
- Ledger append-only.
- PENDING_REFERENCE e reprocessamento.
- FIFO, redrive e ciclo basico de SQS.
- Fluxo HTTP de wallet, wager, replay e reconciliacao.
- Logs estruturados JSON com contexto de correlação.
- Endpoint Prometheus `/metrics` com status, duplicatas, retries, DLQ, lock conflicts, outbox lag e latência.
- Concorrencia em tres processos Bun separados contra o mesmo PostgreSQL (`bun run test:processes`).

## Limites conhecidos

Ainda nao existe cobertura automatizada para:

- desligamento real de PostgreSQL/SQS durante uma execucao;
- reinício coordenado de várias instâncias HTTP com tráfego real.

Os testes de crash entre commit e ACK, publishers concorrentes, retry/DLQ, processos separados e PENDING_REFERENCE com limite/TTL foram adicionados. Desligar containers automaticamente é deliberadamente manual para não interromper ambientes compartilhados; falhas transitórias são exercitadas pelos testes existentes. Portanto, a cobertura distribuída é forte, mas não equivale a um caos-test de infraestrutura.
