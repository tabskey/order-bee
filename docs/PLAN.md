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

⬜ Conexão RabbitMQ + declaração da topologia (ADR-0004)
⬜ Outbox relay com `SKIP LOCKED` e publisher confirms
⬜ Integração: evento no outbox chega à fila `order.created`

Commits: `feat(messaging): declare rabbitmq topology`, `feat(outbox): add outbox relay`

## Etapa 5 — Processamento e estoque ⭐ · Dia 3–4

⬜ Consumer com ack manual e `prefetch`
⬜ `StockService.reserve`: claim + UPDATEs condicionais em ordem de `product_id` (ADR-0001)
⬜ Integração: **concorrência** (estoque 5, três pedidos de 2 → 2 PROCESSED, 1 FAILED, estoque 1)
⬜ Integração: **reentrega** de pedido PROCESSED não altera estoque

Commits: `feat(processing): consume order.created`, `feat(stock): reserve stock atomically`, `test(stock): prove no overselling under concurrency`

## Etapa 6 — Falhas · Dia 4

⬜ `decideFailureAction`, **teste de unidade primeiro**
⬜ Retry por filas de atraso com `RETRY_DELAYS_MS` configurável (atraso no nome da fila), DLQ, simulação `"fail"`
⬜ Integração: `"fail"` → tentativas esgotadas → `FAILED` com motivo + mensagem na DLQ (atrasos de ms, roda em < 1 s)

Commits: `test(processing): cover failure decision`, `feat(processing): add delayed retry and dead-letter`

## Etapa 7 — Autenticação · Dia 5

⬜ Login, `RolesGuard`, `@Roles()` (`JwtStrategy` já existe desde a Etapa 2)
⬜ e2e: 401 sem token; 403 USER no reprocess
⬜ Atualizar `docs/postman/order-bee.postman_collection.json` com `POST /auth/login` e `Bearer {{token}}` nas demais requests

Commits: `feat(auth): add jwt login and role guard`

## Etapa 8 — Bônus · Dia 5–6

⬜ `POST /orders/:id/reprocess` (ADMIN; 409 se não estiver FAILED)
⬜ Swagger com auth configurada
⬜ Atualizar `docs/postman/order-bee.postman_collection.json` com `POST /orders/:id/reprocess`

Commits: `feat(orders): add manual reprocess endpoint`, `docs(api): add swagger`

## Etapa 9 — Documentação · Dia 6–7

⬜ README: como rodar, decisões (links para ADRs), SSO, investigação com logs, o que faria com mais tempo
⬜ `RESPOSTAS.md`: as cinco perguntas
⬜ Revisão final do histórico e dos testes

Commits: `docs: add readme`, `docs: answer architecture questions`

## Folga

Dia 7 é reserva. Se sobrar tempo: métricas simples (profundidade da fila), limpeza do outbox, regra de posse (USER só vê os próprios pedidos).
