# ADR-0003 — Worker como processo separado

- **Status:** Aceito
- **Data:** 2026-09-23

## Contexto

O consumer pode rodar dentro do processo da API ou em processo próprio.

## Decisão

Mesmo repositório e mesma imagem Docker, com dois *entrypoints*: `main.ts` (API HTTP) e `main.worker.ts` (NestJS standalone, sem servidor HTTP). No Compose, são dois serviços.

## Alternativas consideradas

- **Consumer dentro da API**: mais simples, mas acopla o ciclo de vida e os recursos dos dois. Um pico de processamento degrada a latência da API.
- **Repositório separado (microsserviço)**: isolamento total, mas duplica modelos e configuração sem ganho no escopo do teste.

## Consequências

- ✅ Escala independente: mais réplicas de worker sem tocar na API (base da resposta sobre volume 10x).
- ✅ Desacoplamento via fila fica visível na própria topologia do Compose.
- ✅ Código de domínio compartilhado sem duplicação.
- ⚠️ Dois processos para observar; mitigado pelo correlation ID nos logs.
