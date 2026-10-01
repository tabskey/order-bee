# AGENTS.md

Guia para agentes de código neste repositório. Leia antes de qualquer alteração.

## Projeto

API NestJS de pedidos com processamento assíncrono via RabbitMQ e reserva de estoque sob concorrência. Teste técnico: clareza das decisões vale mais que quantidade de código.

## Leitura obrigatória (progressive disclosure)

1. Este arquivo.
2. `docs/ARCHITECTURE.md`: visão geral, modelagem, fluxos.
3. `docs/PLAN.md`: etapa atual e o que ela exige.
4. `docs/adr/`: leia o ADR relacionado **antes** de mexer na área dele.

## Idioma

- Código, identificadores, commits e comentários de código: **inglês**.
- Documentação (`docs/`, README, RESPOSTAS.md): **português**.

## Comandos

```bash
docker compose up --build        # stack completa
npm run test                     # unidade
npm run test:e2e                 # e2e (sobe MySQL via Testcontainers)
npm run test:integration         # MySQL + RabbitMQ reais
npm run migration:generate -- src/shared/database/migrations/<Name>
npm run migration:run
```

## Regras de arquitetura (não negociáveis)

1. **ADRs aceitos são lei.** Discordou? Proponha um novo ADR que substitui o anterior e pare para aprovação humana. Nunca contorne um ADR em silêncio.
2. `domain/` não importa NestJS, TypeORM nem amqplib.
3. **A API nunca publica no RabbitMQ.** Eventos são gravados no outbox, na mesma transação da mudança de estado (ADR-0005).
4. **Estoque só é alterado em `StockService.reserve`**, dentro da transação com o claim do pedido (ADR-0001).
5. **Proibido verificar estoque antes de tentar reservar.** A verificação é o próprio `UPDATE ... WHERE stock >= ?`. Checagem prévia reabre a race condition.
6. Reservas percorrem itens em **ordem crescente de `product_id`**.
7. UPDATEs de estoque e transições de status usam SQL/QueryBuilder explícito com `WHERE` condicional e checagem de `affected`. Nunca `repository.save()` nesses pontos.
8. Falha de negócio no worker é tratada dentro do `StockService` via `ReserveResult`. Qualquer exceção que chega ao consumer é técnica e vira retry (ADR-0012).
9. Mensagens carregam só identificadores (`orderId`, `correlationId`). O banco é a fonte da verdade.
10. Nada de lógica de processamento em controller ou no service de criação.

## Testes

- Regra nova de negócio → teste de unidade antes da implementação.
- **Concorrência e idempotência nunca usam mock de banco.** Um teste que passaria com o código errado não conta.
- Cenários de falha são obrigatórios, não opcionais.
- Nenhum teste espera atrasos reais de produção: configure `RETRY_DELAYS_MS` em milissegundos.

## Commits

Conventional Commits com escopo: `feat(stock): ...`, `test(processing): ...`, `fix(outbox): ...`, `docs(adr): ...`. Um assunto por commit. Proibido `wip`, `ajustes`, `fix stuff`.

## Definição de pronto

- Testes da etapa passando.
- `docs/PLAN.md` atualizado (checkbox da tarefa).
- Decisão nova? ADR criado com status `Proposto` e sinalizado para revisão humana.
- Nenhum `console.log`; use o logger com correlation ID.

## Quando parar e perguntar

- Qualquer mudança que contradiga um ADR.
- Nova dependência de produção.
- Mudança de schema não prevista em `docs/ARCHITECTURE.md`.
