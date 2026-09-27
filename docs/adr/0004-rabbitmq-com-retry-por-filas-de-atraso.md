# ADR-0004 — RabbitMQ com retry por filas de atraso

- **Status:** Aceito
- **Data:** 2026-09-24

## Contexto

O teste exige fila real, retry e dead-letter. A vaga lista RabbitMQ como diferencial. Diferente do BullMQ, o RabbitMQ não oferece retry com atraso pronto: a topologia precisa ser desenhada.

## Decisão

**Broker:** RabbitMQ 3 (imagem `management` para o painel).

**Cliente:** `amqplib` + `amqp-connection-manager` (reconexão automática), encapsulados em `shared/messaging`. Não usamos o transport RMQ do `@nestjs/microservices`, que abstrai exchanges e ack e esconderia justamente a topologia que queremos demonstrar.

**Topologia:**

| Recurso | Configuração |
|---|---|
| exchange `orders` | topic, durável |
| fila `order.created` | durável, bind `order.created` |
| filas `order.created.retry.{delayMs}` | uma por atraso configurado (padrão 1000 / 5000 / 25000 ms); `x-message-ttl` = atraso; `x-dead-letter-exchange: orders`; `x-dead-letter-routing-key: order.created` |
| exchange `orders.dlx` + fila `order.created.dlq` | destino final das mensagens esgotadas |

**Fluxo de retry:** o consumer lê o header `x-attempt`. Em falha técnica com tentativas restantes, publica a mensagem na fila de atraso correspondente (com `x-attempt + 1`, via publisher confirms) e só então dá ack na original. Se a publicação falhar, `nack` com requeue. Máximo de tentativas = número de atrasos + 1 (padrão: 4).

**Atrasos configuráveis:** `RETRY_DELAYS_MS` (padrão `1000,5000,25000`). Os testes usam valores de milissegundos (ex.: `50,100,150`), para que o cenário de falha esgotada rode em menos de um segundo em vez de ~30 s.

O atraso faz parte do **nome da fila** (`order.created.retry.1000`). Motivo: o RabbitMQ recusa redeclarar uma fila existente com argumentos diferentes (`PRECONDITION_FAILED`). Com o atraso no nome, mudar a configuração cria filas novas em vez de quebrar a inicialização; as antigas esvaziam sozinhas e podem ser removidas.

**Consumo:** ack manual, `prefetch` 10, mensagens persistentes.

## Alternativas consideradas

- **TTL por mensagem numa única fila de atraso**: o RabbitMQ só expira mensagens na cabeça da fila; uma mensagem com TTL longo bloqueia as de TTL curto atrás dela. Filas fixas por nível evitam isso.
- **Plugin `rabbitmq_delayed_message_exchange`**: mais elegante, mas exige imagem customizada e não vem no core.
- **`nack` com requeue imediato**: sem backoff; um erro persistente vira loop quente.
- **BullMQ**: retry e DLQ prontos, mas menos alinhado à vaga e esconde as decisões de topologia.

## Consequências

- ✅ Backoff real usando só recursos core do RabbitMQ.
- ✅ Mensagens esgotadas ficam inspecionáveis na DLQ.
- ✅ Suíte de testes rápida sem alterar a lógica: só a configuração muda.
- ⚠️ Mais código de infraestrutura que com BullMQ; isolado em `shared/messaging`.
- ⚠️ Entre publicar no retry e dar ack na original, uma queda gera mensagem duplicada. Aceitável: o consumer é idempotente (ADR-0001).
