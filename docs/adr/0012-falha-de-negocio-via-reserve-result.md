# ADR-0012 — Falha de negócio via `ReserveResult`, sem `BusinessError`

- **Status:** Proposto
- **Data:** 2026-09-30
- **Substitui:** [ADR-0002](0002-classificacao-de-falhas-no-worker.md)

## Contexto

O ADR-0002 classificava falhas no consumer pelo tipo do erro: `BusinessError` → `FAIL_NOW`, qualquer outro → retry ou dead-letter. Na prática, o único erro de negócio do worker (`InsufficientStockError`) é lançado e capturado dentro de `StockService.reserve` (ADR-0001), que marca o pedido `FAILED` e devolve `ReserveResult.INSUFFICIENT_STOCK`. Nenhum `BusinessError` chega ao consumer, e o ramo `FAIL_NOW` nunca roda.

Na API, os outros três `BusinessError` (`OrderNotFoundError`, `OrderNotFailedError` e `ProductsNotFoundError`) só existiam para o service traduzi-los em exceções HTTP.

## Decisão

- **Worker:** a falha de negócio é tratada em `StockService.reserve` via `ReserveResult` (`FAILED` imediato com motivo, ack, sem retry). Toda exceção que chega ao consumer é técnica.
- O consumer decide inline: com `attemptsMade < RETRY_DELAYS_MS.length`, faz retry; senão, `FAILED` + dead-letter. `decideFailureAction` sai, porque virou uma comparação com um único chamador. O limite fica coberto pelo teste de integração "fail → retries → DLQ".
- `BusinessError` deixa de existir. `InsufficientStockError` passa a estender `Error` e continua sendo só o mecanismo de rollback dentro do `reserve`.
- **API:** `OrdersRepository` lança diretamente `NotFoundException` (404), `ConflictException` (409) e `UnprocessableEntityException` (422, ADR-0008). Os try/catch de tradução em `OrdersService` saem.

## Alternativas consideradas

- **Manter `FAIL_NOW` para erros de negócio futuros:** código e teste para um caminho que hoje não existe. Se um erro de negócio novo aparecer no worker, ele entra como um novo `ReserveResult` (ou equivalente no service), ou volta por um ADR novo.
- **Manter erros de domínio na API:** isola o repository de HTTP, mas cada erro custava uma classe mais um `catch` de tradução, e o repository só é usado pela API.

## Consequências

- ✅ Um caminho a menos no consumer; a função de decisão vira uma comparação inline.
- ⚠️ Sem teste de unidade para o limite de tentativas; ele é coberto só pela integração (RabbitMQ real).
- ✅ Menos três classes de erro e dois try/catch na API.
- ⚠️ O repository de pedidos passa a conhecer exceções HTTP do NestJS. É um desvio consciente do padrão Repository (ARCHITECTURE §14). Se o repository for usado fora da API, volta a ter erro de domínio.
- ⚠️ Um erro de negócio lançado no worker fora de `StockService` seria tratado como técnico (retry e depois DLQ). A regra fica registrada no AGENTS.md.
