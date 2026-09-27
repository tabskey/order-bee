# ADR-0007 — TypeORM como ORM

- **Status:** Aceito
- **Data:** 2026-09-24

## Contexto

O teste aceita TypeORM, Prisma ou Sequelize. A reserva de estoque exige transações explícitas e o número de linhas afetadas por UPDATEs condicionais.

## Decisão

TypeORM com migrations versionadas (sem `synchronize`).

## Alternativas consideradas

- **Prisma**: ótima DX, mas transações interativas e UPDATEs condicionais passam por `$executeRaw`, e o controle de transação é menos explícito.
- **Sequelize**: menos idiomático com TypeScript e NestJS.

## Consequências

- ✅ Integração nativa com NestJS (`@nestjs/typeorm`).
- ✅ `QueryRunner` dá controle explícito de BEGIN/COMMIT/ROLLBACK e retorna `affected`.
- ⚠️ Os UPDATEs críticos são escritos com QueryBuilder ou SQL explícito, não com `save()`, para que a atomicidade fique visível no código.
