# ADR-0008 — Validação de produto inexistente no POST

- **Status:** Aceito
- **Data:** 2026-09-24

## Contexto

O payload identifica produtos por `productName`. Um nome inexistente pode ser rejeitado na criação ou falhar no worker.

## Decisão

Rejeitar no `POST /orders` com **422**, listando os nomes não encontrados.

## Justificativa

O enunciado torna assíncrona apenas a validação de **estoque**, por depender de concorrência. A existência do produto é uma validação barata, síncrona e que não sofre race condition relevante. Aceitar e falhar depois só adia um erro que o cliente pode corrigir na hora.

## Consequências

- ✅ Feedback imediato ao cliente; worker só lida com o que é realmente assíncrono.
- ⚠️ Uma consulta a mais no POST (por nome, com índice único).
