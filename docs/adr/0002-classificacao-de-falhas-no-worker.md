# ADR-0002 — Classificação de falhas no worker

- **Status:** Aceito
- **Data:** 2026-09-23

## Contexto

O enunciado pede retry e, esgotadas as tentativas, dead-letter ou `FAILED` com motivo. Mas nem toda falha se beneficia de retry: tentar de novo um pedido sem estoque só gasta tentativas e atrasa o desfecho.

## Decisão

Duas categorias, decididas por uma função pura:

```ts
type FailureAction = 'RETRY' | 'FAIL_NOW' | 'FAIL_AND_DEAD_LETTER';

function decideFailureAction(
  error: unknown,
  attemptsMade: number,
  maxAttempts: number,
): FailureAction;
```

| Erro | Ação |
|---|---|
| `BusinessError` (ex.: `InsufficientStockError`) | `FAIL_NOW`: marca `FAILED` com motivo, sem retry |
| Qualquer outro, com tentativas restantes | `RETRY` com backoff exponencial |
| Qualquer outro, tentativas esgotadas | `FAIL_AND_DEAD_LETTER`: marca `FAILED` com o erro e move para a dead-letter |

A classificação ocorre **depois** da tentativa, pelo tipo do erro. Não existe checagem prévia (ver ADR-0001).

## Consequências

- ✅ Lógica de decisão testável em unidade, sem broker nem banco.
- ✅ Pedidos com falha de negócio chegam a `FAILED` em segundos, não após N tentativas.
- ⚠️ Exige disciplina: todo erro de negócio precisa estender `BusinessError`; um `throw new Error()` genérico vira retry.
