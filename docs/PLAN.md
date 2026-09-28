# Plano de implementação

Prazo: 7 dias. Cada etapa termina com testes passando e commits no padrão Conventional Commits. A ordem prioriza o que o teste mais avalia (fila, falha e concorrência) antes dos bônus.

Legenda: ⬜ a fazer · 🟨 em andamento · ✅ feito

## Etapa 0 — Fundação · Dia 1

✅ Scaffold NestJS, ESLint, Prettier, Jest
✅ `docker-compose.yml`: `mysql`, `rabbitmq` (management), `migrate` (one-shot), `api`, `worker`, com healthchecks e `depends_on`
✅ Dockerfile único (multi-stage) com dois comandos: API e worker
✅ Config via `@nestjs/config` com validação das variáveis de ambiente
✅ Pino + middleware de correlation ID (cedo, para que todo log já nasça com contexto)

Commits esperados: `chore: scaffold nestjs project`, `chore: add docker compose stack`, `feat(logging): add pino with correlation id`

**Pronto quando:** `docker compose up` sobe tudo e `GET /health` responde.

## Etapa 1 — Dados · Dia 1–2

✅ TypeORM + migrations: `users`, `products`, `orders`, `order_items`, `outbox_events` (tipos, FKs, CHECKs e índices da seção 5)
✅ Seed: dois usuários (USER, ADMIN) e produtos com estoque 5

Commits: `feat(db): add initial schema migration`, `feat(db): add seed data`

## Etapa 2 — Criação de pedido · Dia 2

✅ `calculateOrderTotal` em centavos, **teste de unidade primeiro**
✅ `POST /orders`: DTO, validação de produto (422), transação order + items + outbox
✅ e2e: POST → pedido `PENDING` + linha no outbox; 422 para produto inexistente
✅ Atualizar `docs/postman/order-bee.postman_collection.json` com `POST /orders`

`JwtStrategy` (verificação do token, sem login/roles) foi adiantada da Etapa 7 para cá: `orders.created_by` é obrigatório desde a criação, então `POST /orders` já exige `Authorization: Bearer`. Formato do payload documentado na seção 6 de `docs/ARCHITECTURE.md`.

Commits: `test(orders): cover order total calculation`, `feat(auth): add minimal jwt verification`, `test(e2e): add testcontainers mysql harness`, `feat(orders): create order with outbox event`, `docs: document orders payload and update postman`

## Etapa 3 — Consulta · Dia 2

✅ `GET /orders/:id` (404 se não existe)
✅ `GET /orders?page&limit` com limites (`limit` máx. 100) e metadados de paginação
✅ Atualizar `docs/postman/order-bee.postman_collection.json` com `GET /orders/:id` e `GET /orders`

Commits: `feat(orders): add get and list endpoints`

## Etapa 4 — Mensageria · Dia 3

✅ Conexão RabbitMQ + declaração da topologia (ADR-0004)
✅ Outbox relay com `SKIP LOCKED` e publisher confirms
✅ Integração: evento no outbox chega à fila `order.created`

Commits: `feat(messaging): declare rabbitmq topology`, `feat(outbox): add outbox relay`

## Etapa 5 — Processamento e estoque ⭐ · Dia 3–4

✅ Consumer com ack manual e `prefetch`
✅ `StockService.reserve`: claim + UPDATEs condicionais em ordem de `product_id` (ADR-0001)
✅ Integração: **concorrência** (estoque 5, três pedidos de 2 → 2 PROCESSED, 1 FAILED, estoque 1)
✅ Integração: **reentrega** de pedido PROCESSED não altera estoque

Commits: `feat(processing): consume order.created`, `feat(stock): reserve stock atomically`, `test(stock): prove no overselling under concurrency`

## Etapa 6 — Falhas · Dia 4

✅ `decideFailureAction`, **teste de unidade primeiro**
✅ Retry por filas de atraso com `RETRY_DELAYS_MS` configurável (atraso no nome da fila), DLQ, simulação `"fail"`
✅ Integração: `"fail"` → tentativas esgotadas → `FAILED` com motivo + mensagem na DLQ (atrasos de ms, roda em < 1 s)

Commits: `test(processing): cover failure decision`, `feat(processing): add delayed retry and dead-letter`

## Etapa 7 — Autenticação · Dia 5

✅ Login, `RolesGuard`, `@Roles()` (`JwtStrategy` já existe desde a Etapa 2)
✅ e2e: 401 sem token (já coberto na Etapa 2); login com sucesso e credenciais inválidas (401). O caso "403 USER no reprocess" exige o endpoint da Etapa 8 e será coberto junto dele; `RolesGuard` tem teste de unidade cobrindo permitir/negar por role.
✅ Atualizar `docs/postman/order-bee.postman_collection.json` com `POST /auth/login` (captura `{{token}}` automaticamente) e `Bearer {{token}}` já usado nas demais requests

Commits: `feat(auth): add jwt login and role guard`

## Etapa 8 — Bônus · Dia 5–6

✅ `POST /orders/:id/reprocess` (ADMIN; 409 se não estiver FAILED)
✅ Swagger com auth configurada
✅ Atualizar `docs/postman/order-bee.postman_collection.json` com `POST /orders/:id/reprocess`
✅ `POST /auth/register` (pública, cria conta `USER`), `DELETE /users/:id` (ADMIN, soft delete) e `PATCH /users/:id/role` (ADMIN, promove/rebaixa outro usuário com log de auditoria em `user_role_changes`) — [ADR-0009](adr/0009-registro-de-conta-e-softdelete-de-usuario.md)
✅ Atualizar `docs/postman/order-bee.postman_collection.json` com `POST /auth/register`, `DELETE /users/:id` e `PATCH /users/:id/role`

Commits: `feat(orders): add manual reprocess endpoint`, `docs(api): add swagger`, `feat(auth): add account registration`, `feat(users): add admin soft delete and role change with audit log`

## Etapa 9 — Observabilidade · Dia 6

✅ RabbitMQ Management UI, DLQ e logs com `correlationId`/`orderId` já cobertos nas Etapas 0, 4 e 6 — nada a fazer aqui (ver seção 13 de `docs/ARCHITECTURE.md` e [ADR-0004](adr/0004-rabbitmq-com-retry-por-filas-de-atraso.md))
✅ `GET /health` passa a reportar conectividade real: MySQL via `DataSource` (`SELECT 1`) e RabbitMQ via `RabbitmqConnection.isConnected()` (novo accessor, sem dependência nova). Banco fora do ar é falha real da API (`503`); RabbitMQ fora do ar é só informativo (`200`, `status: 'degraded'`) — a API nunca depende do broker para aceitar pedidos ([ADR-0005](adr/0005-transactional-outbox.md))
✅ `OutboxRelayService` passa a logar `outbox.published` por evento publicado (antes só existia log de erro do lote)
✅ Atualizar `docs/ARCHITECTURE.md` (seção 13) com o formato de `/health`

Commits esperados: `feat(health): report db and rabbitmq connectivity`, `feat(outbox): log published events`, `docs(architecture): document health check shape`

**Pronto quando:** `GET /health` reflete o estado real de MySQL e RabbitMQ sem depender do broker para responder; `outbox.published` aparece no log a cada evento relayado.

## Etapa 10 — Documentação · Dia 6–7

✅ README: como rodar, decisões (links para ADRs), SSO, investigação com logs, o que faria com mais tempo
✅ `RESPOSTAS.md`: as cinco perguntas
✅ Revisão final do histórico e dos testes

Commits: `docs: add readme`, `docs: answer architecture questions`

## Folga

Dia 7 é reserva. Se sobrar tempo: métricas simples (profundidade da fila), limpeza do outbox.

## Revisão sênior (critérios de avaliação)

✅ Consumer: poison message vai para a DLQ; falha ao tratar erro faz `nack` com requeue (antes a mensagem ficava sem ack)
✅ Correlation ID do cliente só aceito se for UUID (antes: 500 com header longo em `CHAR(36)`)
✅ Paginação determinística (`created_at DESC, id DESC`)
✅ Limites nos DTOs alinhados às colunas; `ParseUUIDPipe` em `:id`
✅ `publishTimeout` no publisher: relay não segura transação com broker fora do ar
✅ Google SSO: conta soft-deletada → 401; corrida no primeiro login não gera 500
✅ Regra de posse: USER só vê os próprios pedidos (404 para os de outros), ADMIN vê todos
✅ Testes: rollback de reserva multi-item, validações, correlation ID, posse, Google SSO
✅ `JWT_EXPIRES_IN` padrão alinhado aos ADRs 0006/0009 (15 min)

Commits: `fix(processing): never leave a message unacked`, `fix(logging): accept only uuid correlation ids`, `fix(orders): deterministic pagination and input bounds`, `fix(outbox): time out publishes while broker is down`, `fix(auth): handle soft-deleted and concurrent google logins`, `feat(orders): restrict users to their own orders`, `test(stock): prove multi-item reservation rolls back`, `docs: record trade-offs from senior review`

## Bônus extra — Login via Google (SSO real) · Dia 7+

✅ ADR-0010: login via Google além do JWT local (estende ADR-0006, aprovado)
✅ ⚠️ Nova dependência de produção: `google-auth-library` (verificação oficial de ID token do Google) — aprovada pelo usuário, instalada
✅ `POST /auth/google` — recebe `idToken` do Google, valida via JWKS oficial, upsert de usuário local por e-mail (role padrão USER), emite o mesmo JWT HS256 já usado hoje
✅ Teste de unidade: validação do ID token e mapeamento para usuário (mock do client do Google)
✅ e2e: login com Google cria usuário novo; login repetido reusa o mesmo usuário; token do Google inválido → 401
✅ Atualizar `docs/postman/order-bee.postman_collection.json` com `POST /auth/google`
✅ Atualizar `docs/ARCHITECTURE.md` §12 e README (seção "Integração com SSO") com o fluxo real implementado

Commits: `docs(adr): propose google sso login`, `feat(auth): add google sso login`, `test(auth): cover google sso login`, `docs: update postman and architecture for google sso`
