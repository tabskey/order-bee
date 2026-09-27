# ADR-0005 — Transactional Outbox

- **Status:** Aceito
- **Data:** 2026-09-24

## Contexto

Criar um pedido envolve duas escritas em sistemas diferentes: o MySQL e o RabbitMQ. Sem coordenação (*dual write*):

- banco confirma, publicação falha → pedido `PENDING` para sempre;
- publica antes do commit, commit falha → worker processa pedido inexistente.

Não há transação distribuída entre MySQL e RabbitMQ.

## Decisão

A API grava pedido, itens e uma linha em `outbox_events` **na mesma transação**. A API nunca publica no broker.

Um relay no processo worker, a cada ~500 ms, seleciona eventos com `published_at IS NULL` usando `FOR UPDATE SKIP LOCKED`, publica com publisher confirms e marca `published_at`.

O `OrderCreatedEvent` é o evento de domínio; o outbox é o mecanismo de entrega. O `OrdersService` registra o evento no outbox pelo mesmo `EntityManager` da transação, sem conhecer o broker.

O reprocessamento manual usa o mesmo caminho.

## Alternativas consideradas

- **Publicar após o commit + reconciliador de pedidos `PENDING` antigos**: mais simples, mas a janela de inconsistência é detectada, não evitada, e o reconciliador precisa adivinhar se o pedido está travado ou só lento.
- **`@nestjs/event-emitter` publicando no listener**: não participa da transação; continua sendo dual write.
- **CDC (Debezium) lendo o binlog**: robusto, mas infraestrutura desproporcional ao escopo.

## Consequências

- ✅ Nenhum pedido fica sem evento: se existe no banco, será publicado.
- ✅ API independente da disponibilidade do RabbitMQ para aceitar pedidos.
- ✅ `SKIP LOCKED` permite várias réplicas do worker.
- ⚠️ Garante *at-least-once*, não *exactly-once*: uma queda entre publicar e marcar gera duplicata. Resolvido pelo consumer idempotente (ADR-0001).
- ⚠️ Latência extra de até ~500 ms até a publicação.
- ⚠️ A tabela cresce; limpeza de eventos publicados antigos fica como melhoria futura.
- ⚠️ A transação do relay fica aberta durante a publicação do lote; lotes pequenos (50) limitam o impacto.
