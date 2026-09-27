# ADR-0001 — Reserva de estoque atômica e idempotente

- **Status:** Aceito
- **Data:** 2026-09-23

## Contexto

O worker reserva estoque ao processar `order.created`. Dois riscos precisam ser eliminados:

1. **Overselling**: pedidos concorrentes para o mesmo produto somam mais que o estoque (race condition *check-then-act*).
2. **Decremento duplicado**: a fila entrega *at-least-once*; um retry do mesmo pedido não pode reservar duas vezes.

O estoque nunca pode ficar negativo, mesmo sob concorrência.

## Decisão

Uma única transação por pedido:

```sql
BEGIN;
-- 1. Claim idempotente do pedido
UPDATE orders SET status = 'PROCESSED', processed_at = NOW()
  WHERE id = :orderId AND status = 'PENDING';
-- affectedRows = 0 → já processado: COMMIT e descarta a mensagem

-- 2. Reserva atômica, itens em ordem crescente de product_id
UPDATE products SET stock = stock - :qty
  WHERE id = :productId AND stock >= :qty;
-- algum affectedRows = 0 → ROLLBACK + InsufficientStockError
COMMIT;
```

Em caso de `InsufficientStockError`, uma segunda transação curta registra a falha:

```sql
UPDATE orders SET status = 'FAILED', failure_reason = 'estoque insuficiente'
  WHERE id = :orderId AND status = 'PENDING';
```

Complementos: `CHECK (stock >= 0)` na tabela `products` como defesa em profundidade.

## Alternativas consideradas

- **Lock otimista (`version`)**: resolve overselling, mas não idempotência. O retry lê a versão atual e decrementa de novo. Sob contenção, exige loop de retry na aplicação.
- **Lock pessimista (`SELECT ... FOR UPDATE`)**: correto para overselling, mas segura as linhas durante a lógica da aplicação e continua sem resolver idempotência sozinho. O UPDATE condicional obtém o mesmo lock de linha só pelo tempo da instrução.
- **Checagem prévia de estoque antes de tentar**: reintroduz a race condition. Descartada.
- **Tabela de idempotência com chave única (`processed_messages`)**: funcionaria, mas o status do pedido já é a chave natural. Tabela extra sem ganho aqui.

## Consequências

- ✅ Correto sob concorrência e sob reentrega, verificado por teste de integração com MySQL real.
- ✅ Sem tabelas extras nem loops de retry na aplicação.
- ⚠️ Pedidos com vários itens podem entrar em deadlock; mitigado pela ordenação por `product_id`, e `ER_LOCK_DEADLOCK` é tratado como erro técnico (retry).
- ⚠️ A correção depende da transação cobrir claim e reserva juntos; isso deve ficar explícito no código e em teste.
