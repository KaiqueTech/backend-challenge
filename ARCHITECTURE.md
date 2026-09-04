# Arquitetura do Distributed Wagering Processor

## Visão geral

Este projeto implementa um processador financeiro de apostas em NestJS com PostgreSQL e SQS, priorizando correção financeira, idempotência persistente e processamento resiliente em cenários de entrega duplicada, reordenação e concorrência real.

A solução adota uma abordagem de agregados e transações de banco com lock explícito por wallet, recebendo entradas via HTTP ou fila SQS, sem depender de cache em memória para garantir consistência.

## Decisões de projeto

### 1. Money e precisão monetária

- O valor monetário é representado por `decimal.js`, nunca por `number`.
- A entrada e saída de contratos usam string decimal com duas casas (`"25.00"`), como exigido pelo README.
- A moeda é tratada como parte do valor e a validação exige que a operação e a wallet compartilhem a mesma moeda.
- Operações entre moedas incompatíveis geram erro de domínio.
- O domínio encapsula regras como `add`, `subtract`, `isNegative`, `equals` e `assertSameCurrency`, mantendo a API de negócio separada do ORM.

### 2. Agregados e invariantes

A modelagem de domínio foi organizada em agregados com regras explícitas:

- `Money`: imutável, valida escala e entrada.
- `Wallet`: responsável por saldo, versão e movimentações de débito/crédito.
- `WagerTransaction`: encapsula estado, validações, referência obrigatória e transições terminal/pendente.
- `WalletLedgerEntry`: lançamento imutável, único por transação financeira e balanceado.

As regras críticas são preservadas em aplicação e, quando possível, em schema do banco via constraints, unicidade e integridade referencial.

### 3. Persistência e concorrência

O banco de dados é a fonte de verdade. A aplicação usa MikroORM + PostgreSQL e reúne as operações financeiras e de integração na mesma transação SQL.

Estratégia adotada:

- `Wallet` e `WagerTransaction` são persistidos em uma transação única para cada operação financeira.
- A leitura e atualização da wallet usam lock explícito por linha (`FOR UPDATE` / lock pessimista), evitando lost update quando múltiplas instâncias acessam a mesma wallet.
- O ledger é append-only e não pode ser atualizado ou apagado.
- O saldo materializado e o ledger são reconstituidos e validados em reconciliação.

A solução evita usar memória como garantia de idempotência e evita “read → calculate → update” sem controle de concorrência.

### 4. Idempotência

A idempotência é persistente e promove segurança financeira:

- HTTP: usa `Idempotency-Key` e o payload é convertido em `payloadHash` canônico.
- Mesma chave com mesmo payload retorna o resultado original.
- Mesma chave com payload diferente resulta em conflito explícito.
- SQS: usa `InboxMessage` com unicidade por `(consumerName, messageId)`.

Isso garante que mensagens duplicadas ou reentregues não repitam efeitos colaterais financeiros.

### 5. SQS, inbox e outbox

A aplicação separa o processamento de mensagens do estado financeiro:

- a fila recebe eventos de transação solicitada;
- o consumidor valida o domínio e aplica a lógica de negócio;
- o registro de inbox é persistido junto com a transação financeira;
- o ack do SQS só ocorre após o commit do banco;
- eventos de integração são persistidos em `outbox_messages` e publicados por um worker dedicado.

A outbox é usada para garantir que o evento seja publicado depois do commit, sem perder dados quando a instância morre após o commit mas antes da entrega.

### 6. Worker de referência e retry

Transações com referência ausente entram em estado `PENDING_REFERENCE` e são reprocessadas por um worker com backoff exponencial.

A lógica de retry faz distinção entre:

- erro de negócio terminal (não reprocessar);
- falha transitória (retry com backoff);
- falha permanente (encaminhar para DLQ).

### 7. Autenticação

O desafio não prioriza autenticação como critério de avaliação. Por isso, a aplicação usa um ponto de extensão explícito para identidade externa, sem forçar uma implementação artesanal local.

No código atual, a autenticação não é aplicada no nível do desafio e a aplicação assume esse ponto como extensão do domínio. Se futuramente houver uso de Keycloak, Zitadel ou IdP equivalente, o guard pode ser conectado sem impactar a lógica financeira.

#### Como utilizar Keycloak

Uma integração recomendada seria usar o Keycloak como Identity Provider OIDC, deixando autenticação, emissão e validação de tokens fora da aplicação.

1. Criar um realm, por exemplo `jungle-gaming`.
2. Criar um client para a API, por exemplo `wagering-api`, configurado como `bearer-only` ou como um resource server equivalente.
3. Registrar os provedores como clients ou como identidades representadas por roles/scopes, conforme o modelo de operação adotado.
4. Criar roles como `wager:write`, `wager:read`, `wallet:read` e `reconciliation:read`.
5. Configurar os consumidores para obterem um access token usando o fluxo apropriado para integração máquina-a-máquina, preferencialmente `client_credentials`.
6. Enviar o token nas chamadas HTTP:

```http
Authorization: Bearer <access-token>
```

Na API NestJS, um `AuthGuard` validaria:

- assinatura do JWT usando as chaves públicas do realm (JWKS);
- emissor (`iss`) esperado;
- audiência (`aud`) da API;
- validade temporal (`exp` e, quando aplicável, `nbf`);
- scopes ou roles necessários para cada endpoint.

O guard não deve confiar em dados enviados no body para identificar o chamador. A identidade autenticada deve ser extraída das claims do token (`sub`, `azp`, `client_id`, roles/scopes) e disponibilizada no request por um objeto tipado, como `AuthenticatedPrincipal`.

Uma política possível para os endpoints seria:

| Endpoint | Permissão |
|---|---|
| `POST /wallets` | `wallet:write` |
| `GET /wallets/:walletId` | `wallet:read` |
| `GET /wallets/:walletId/ledger` | `wallet:read` |
| `POST /wagering/transactions` | `wager:write` |
| `GET /wagering/transactions/:transactionId` | `wager:read` |
| `POST /wallets/:walletId/reconciliation` | `reconciliation:read` |
| `GET /health/live` e `GET /health/ready` | públicos |

O `providerId` recebido na transação continuaria sujeito às validações de domínio, mas também poderia ser comparado com uma claim do token, como `azp` ou uma claim customizada `provider_id`. Essa associação impede que um provedor autenticado envie operações em nome de outro provedor. Essa regra deve ser aplicada no caso de uso, não apenas no controller.

Em ambiente local, o Keycloak poderia ser adicionado ao Docker Compose com um realm pré-configurado para desenvolvimento. Segredos de clients devem ser fornecidos por variáveis de ambiente ou secrets, nunca versionados. Em produção, a API deve usar HTTPS, rotação de chaves via JWKS, timeouts para o discovery endpoint e cache controlado das chaves públicas. A indisponibilidade momentânea do Keycloak não deve invalidar tokens já emitidos enquanto a assinatura e a validade puderem ser verificadas localmente.

As mensagens recebidas pela fila SQS continuam sendo tratadas como canal interno confiável, conforme o README. Ainda assim, o produtor da mensagem deve ser identificado por `providerId` e validado pelas mesmas regras de domínio; autenticação HTTP não substitui essa validação.

### 8. Observabilidade

A arquitetura entrega logs estruturados, health checks separados e alinhamento com métricas de:

- transações por status;
- duplicatas detectadas;
- retries; 
- mensagens em DLQ;
- outbox lag;
- latência do processamento.

Esses indicadores foram desenhados para diagnóstico em ambientes com múltiplas instâncias e entrega duplicada.

## Fluxo principal

1. Requisição HTTP ou mensagem SQS entra no controller/consumer.
2. O caso de uso valida idempotência e referência.
3. A wallet é bloqueada para evitar lost update.
4. O domínio calcula o próximo saldo e cria/atualiza o ledger e a transação.
5. Inbox, wallet, ledger e outbox são escritos na mesma transação SQL.
6. O commit confirma o estado financeiro.
7. O worker da outbox publica eventos pendentes.
8. O consumer SQS faz ack somente após o sucesso do commit.

## Trade-offs e limitações conhecidas

A implementação cobre os cenários distribuídos principais e possui testes de recuperação e concorrência. O crash entre commit e ACK é seguro por causa da Inbox persistente: a redelivery é processada novamente, mas o efeito financeiro é deduplicado.

Limitações reconhecidas:

- a indisponibilidade real de PostgreSQL/SQS depende de ambiente externo e é exercitada por testes de falha transitória, não por desligamento automatizado dos containers;
- a política de DLQ é aplicada pelo redrive do SQS; mensagens só são consideradas elegíveis após esgotar `SQS_MAX_ATTEMPTS`;
- as métricas são mantidas em memória por processo e devem ser exportadas/agrupadas por um collector Prometheus em produção; elas não são usadas para garantias de negócio.

## Conclusão

A arquitetura foi desenhada para priorizar correção financeira acima de conveniência operacional. O uso de transação SQL, lock por wallet, ledger auditável, inbox/outbox duráveis e idempotência persistente são os pilares que tornam a solução resiliente em sistemas distribuídos.

## Status de implementação

### Implementado e validado em nível funcional

- Domínio financeiro encapsulado em `Money`, `Wallet`, `WagerTransaction` e `WalletLedgerEntry`.
- Persistência com PostgreSQL via MikroORM.
- Controle de concorrência por wallet com lock explícito.
- Ledger auditável e append-only.
- Idempotência de HTTP por `Idempotency-Key` e payload hash canônico.
- Inbox persistente para SQS.
- Outbox para eventos e publicação assíncrona.
- Health check de liveness e readiness.
- Logs JSON com correlação e endpoint Prometheus `/metrics`.
- Fluxos HTTP para wallet e transações.
- Testes unitários e testes end-to-end básicos.

### Parcialmente validado

- Reprocessamento de `PENDING_REFERENCE` com limite de tentativas, TTL e estado terminal `FAILED`.
- Retry com backoff para mensagens transitórias, incluindo falhas de PostgreSQL/SQS.
- Redelivery e deduplicação em consumer SQS, inclusive crash entre commit e ACK.
- Reconcilição entre saldo materializado e ledger.
- Concorrência de publishers da outbox com `FOR UPDATE SKIP LOCKED`.
- Concorrência de três processos Bun independentes contra o PostgreSQL compartilhado.

### Ainda pendente para conformidade plena com o README

- Teste de desligamento real de PostgreSQL/SQS durante uma execução (a cobertura atual usa falhas injetadas e LocalStack/PostgreSQL reais).
- Reinício coordenado de várias instâncias HTTP com tráfego real.
- Integração efetiva com um provedor externo de autenticação não faz parte desta entrega; o desafio permite essa decisão e o desenho para Keycloak está documentado como ponto de extensão.

### Avaliação honesta do projeto

A base da solução está correta e coerente com o desafio. A observabilidade e o teste de concorrência em três processos estão implementados; os limites restantes são explicitamente dependentes de um ambiente Docker dedicado para falhas destrutivas.
