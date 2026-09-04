# Documentacao da aplicacao

Este diretorio explica como instalar, executar, testar e validar o Distributed Wagering Processor.

## Ordem recomendada

1. Leia [01-configuracao.md](01-configuracao.md).
2. Suba PostgreSQL e LocalStack.
3. Aplique as migrations.
4. Inicie a API.
5. Execute o fluxo manual em [03-api-e-swagger.md](03-api-e-swagger.md).
6. Execute os testes de [04-testes.md](04-testes.md).
7. Use [05-verificacao.md](05-verificacao.md) para conferir os resultados.

## Guias

- [01-configuracao.md](01-configuracao.md): pre-requisitos e variaveis de ambiente.
- [02-arquitetura.md](02-arquitetura.md): responsabilidade de cada camada e fluxo de dados.
- [03-api-e-swagger.md](03-api-e-swagger.md): endpoints, exemplos e resultados esperados.
- [04-testes.md](04-testes.md): comandos de testes unitarios, integracao, SQS e e2e.
- [05-verificacao.md](05-verificacao.md): checklist de validacao e troubleshooting.

## Servicos locais

| Servico | Endereco | Funcao |
| --- | --- | --- |
| API | http://localhost:3000 | HTTP, Swagger e workers |
| Swagger | http://localhost:3000/docs | Teste manual da API |
| PostgreSQL | localhost:5432 | Fonte de verdade financeira |
| LocalStack | http://localhost:4566 | Filas SQS locais |
