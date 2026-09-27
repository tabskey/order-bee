# Order Bee

API de pedidos com criação síncrona e processamento assíncrono (reserva de estoque) via RabbitMQ. Documento vivo de arquitetura em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), decisões em [`docs/adr/`](docs/adr/), plano de implementação em [`docs/PLAN.md`](docs/PLAN.md), respostas às perguntas de arquitetura em [`RESPOSTAS.md`](RESPOSTAS.md).

## Como rodar

```bash
cp .env.example .env
docker compose up --build
```

Sobe `mysql`, `rabbitmq`, roda migrations (`migrate`, one-shot) e sobe `api` + `worker`. Pronto quando `GET http://localhost:3000/health` responde `200`.

Seed (usuários e produtos de teste):

```bash
docker compose exec api npm run seed
```

Usuários: `user@test.local` / `user123` (role `USER`) e `admin@test.local` / `admin123` (role `ADMIN`). Produtos `Widget`, `Gadget`, `Gizmo`, estoque 5 cada.

- Swagger: `http://localhost:3000/docs`
- RabbitMQ Management: `http://localhost:15672` (`guest` / `guest`)
- Postman: [`docs/postman/order-bee.postman_collection.json`](docs/postman/order-bee.postman_collection.json) — `POST /auth/login` captura `{{token}}` automaticamente; as demais requests já usam `Bearer {{token}}`.

Rodando fora do compose (`npm run start:dev` / `npm run start:worker:dev`), aponte `.env` para `localhost` em vez dos hostnames dos serviços.

## Testes

```bash
npm run test              # unidade
npm run test:e2e          # e2e, MySQL real via Testcontainers
npm run test:integration  # MySQL + RabbitMQ reais via Testcontainers
```

Sem mocks em teste de concorrência, idempotência ou retry (ver `docs/AGENTS.md`).

## Decisões de arquitetura

Visão geral em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). ADRs:

| ADR | Decisão |
|---|---|
| [0001](docs/adr/0001-reserva-de-estoque-atomica-e-idempotente.md) | Reserva de estoque atômica e idempotente (⭐ requisito central) |
| [0002](docs/adr/0002-classificacao-de-falhas-no-worker.md) | Classificação de falhas: negócio vs. técnica |
| [0003](docs/adr/0003-worker-como-processo-separado.md) | Worker como processo separado da API |
| [0004](docs/adr/0004-rabbitmq-com-retry-por-filas-de-atraso.md) | RabbitMQ com retry por filas de atraso e DLQ |
| [0005](docs/adr/0005-transactional-outbox.md) | Transactional outbox para publicar sem dual write |
| [0006](docs/adr/0006-jwt-proprio-com-roles.md) | JWT próprio com roles (SSO descrito abaixo) |
| [0007](docs/adr/0007-typeorm-como-orm.md) | TypeORM como ORM |
| [0008](docs/adr/0008-validacao-de-produto-no-post.md) | Validação de produto no `POST /orders` |
| [0009](docs/adr/0009-registro-de-conta-e-softdelete-de-usuario.md) | Registro de conta, soft delete e troca de role com auditoria |

## Integração com SSO (Keycloak/Auth0)

O teste pede JWT próprio com usuário de teste; SSO fica descrito, não implementado (trade-off em [ADR-0006](docs/adr/0006-jwt-proprio-com-roles.md)). Para trocar:

- `JwtStrategy` passa a validar RS256 com chaves do endpoint JWKS do provedor (`jwks-rsa`, com cache), em vez de segredo HS256 local.
- Validação de `iss` e `aud`; roles extraídas de `realm_access.roles` (Keycloak) ou de claim customizada (Auth0).
- `POST /auth/login` e `users.password_hash` deixam de existir; a API vira apenas *resource server*, o provedor cuida de autenticação.
- `RolesGuard` e `@Roles()` não mudam — dependem só do payload decodificado, não de quem emitiu o token.

Impacto de indisponibilidade e mitigação: ver pergunta 4 em [`RESPOSTAS.md`](RESPOSTAS.md).

## Investigação com logs

Pino (JSON) com `correlationId` propagado: request → `orders.correlation_id` → `outbox_events` → header da mensagem → logger filho no consumer. Eventos: `order.created`, `outbox.published`, `order.processing.started`, `order.retry.scheduled`, `order.processed`, `order.failed`, `order.dead_lettered` (seção 13 de `docs/ARCHITECTURE.md`).

Fluxo prático para "pedido X travado": filtrar por `correlationId` e ver onde a trilha para — detalhado na pergunta 5 de [`RESPOSTAS.md`](RESPOSTAS.md).

## O que faria com mais tempo

- Regra de posse: `USER` só vê os próprios pedidos (`GET /orders` filtrado por `created_by`, exceto `ADMIN`).
- Métricas (profundidade das filas, taxa de falha, latência de processamento) expostas em `/metrics` (Prometheus).
- Job de limpeza do outbox (arquivar ou apagar eventos publicados antigos).
- Refresh token e revogação — hoje o JWT expira em 15 min sem renovação.
- Cache do `jwks-rsa` e circuit breaker explícitos, caso a integração com SSO (seção acima) seja implementada de fato.
