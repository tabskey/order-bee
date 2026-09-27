# Respostas — perguntas de arquitetura e sistemas

## 1. Como você garantiria que um evento não seja processado duas vezes pelo consumidor em caso de reentrega da fila?

Já implementado (ver [ADR-0001](docs/adr/0001-reserva-de-estoque-atomica-e-idempotente.md)). O evento carrega só `orderId`; o consumer não confia em "já vi essa mensagem", e sim no estado do pedido no banco, que é a fonte da verdade:

```sql
UPDATE orders SET status = 'PROCESSED', processed_at = NOW()
  WHERE id = :orderId AND status = 'PENDING';
```

Se `affectedRows = 0`, o pedido já foi processado (ou está sendo processado por outra entrega concorrente, que segura a linha até o commit) — a mensagem é confirmada (ack) sem reservar estoque de novo. O claim e a reserva de estoque acontecem na mesma transação, então não há janela entre "verificar se já processou" e "processar". Uma tabela de deduplicação (`processed_messages` com chave única) resolveria o mesmo problema, mas o status do pedido já é a chave natural — tabela extra sem ganho aqui.

## 2. Como você escalaria o worker de consumo de eventos se o volume de pedidos multiplicasse por 10x?

Nessa ordem, do mais barato ao mais caro:

1. **Mais réplicas do processo worker.** RabbitMQ distribui as mensagens de `order.created` entre todos os consumers conectados à fila (round-robin); nenhuma mudança de código. O relay do outbox já usa `SKIP LOCKED`, então também escala horizontalmente sem publicar o mesmo evento duas vezes.
2. **Aumentar `prefetch`** (hoje 10) até o ponto em que backpressure do banco vira o gargalo, não a fila.
3. **Particionar por `product_id`** se a contenção nas linhas de `products` virar o limite (índices de produtos "quentes" concorrendo entre si). Múltiplas filas por *hash* de produto, cada uma com seu grupo de consumers, reduz a fila de espera na mesma linha sem tocar na lógica de reserva.
4. **MySQL:** confirmar que `products(name)` e os índices de `orders(status, created_at)` seguem cobrindo as queries; se a escrita em `orders`/`order_items` virar gargalo, réplica de leitura para `GET /orders` tira carga do primário, que fica livre para o worker.
5. Nada disso exige mudar `StockService.reserve`: a correção sob concorrência (ADR-0001) não depende de quantos workers existem, só da transação por pedido.

## 3. Como você faria uma migração de schema neste banco em produção, sem downtime?

Migração expand/contract, nunca uma mudança destrutiva num passo só:

1. **Expand**: adicionar o novo (coluna nullable, ou com `DEFAULT`; tabela nova; índice novo) sem remover nem renomear nada. TypeORM migration comum, roda com a aplicação antiga e a nova ao mesmo tempo no ar.
2. **Deploy do código** que passa a escrever no novo formato e ainda lê o antigo se precisar (dual write/read durante a transição).
3. **Backfill** dos dados existentes em lotes (`UPDATE ... LIMIT` ou cursor por PK), fora do horário de pico, para não segurar locks longos nem saturar I/O.
4. **Contract**: só depois que 100% do tráfego usa o novo formato, uma segunda migration remove a coluna/tabela antiga.

Cuidados específicos deste schema: `CHECK (stock >= 0)` e as `FOREIGN KEY` não podem ser adicionadas de uma vez em tabela grande sem `ALGORITHM=INPLACE` (MySQL 8 suporta para a maioria dos `ADD COLUMN`/`ADD INDEX`); renomear coluna é sempre dois passos (adicionar a nova, migrar leitura/escrita, remover a antiga) porque um rename direto quebra a versão anterior da aplicação enquanto ela ainda estiver no ar durante o deploy gradual. Nunca rodar migration que trava a tabela inteira (`ALTER TABLE` sem `ALGORITHM=INPLACE,LOCK=NONE` em tabela grande) sem testar o tempo de lock antes, com uma cópia do volume de produção.

## 4. Se o provedor de SSO (Keycloak/Auth0) ficar indisponível, como isso afeta sua API, e o que você faria para mitigar?

Depende de qual parte do SSO cai:

- **Emissão de token (login) indisponível**: usuários já logados continuam funcionando — a API valida o JWT localmente (assinatura + expiração), sem chamar o provedor a cada request. Só usuários novos ou com token expirado ficam bloqueados até o provedor voltar.
- **Endpoint JWKS (chaves públicas) indisponível**: mais grave, porque é aí que a API de fato depende do provedor. Mitigação: `jwks-rsa` com cache das chaves (elas trocam raramente) e um TTL longo o suficiente para sobreviver a uma indisponibilidade curta; se a chave já está em cache, a API segue validando tokens normalmente mesmo com o provedor fora do ar. Só falha se precisar buscar uma chave nova (rotação) durante a indisponibilidade.
- Nunca faria a API chamar o provedor de SSO de forma síncrona a cada request para "confirmar" o token — isso transformaria a indisponibilidade do SSO em indisponibilidade total da API, quando a validação local do JWT já é suficiente.

No modelo atual (ADR-0006), a API não tem esse risco porque emite e valida o próprio JWT; é o trade-off registrado ali — a migração para SSO real (descrita no README) precisa levar esse cache junto.

## 5. Dado um pedido que ficou "travado" sem confirmação, como você investigaria se o problema está na API, na fila ou no worker?

Trilha por `correlationId` (seção 13 de `docs/ARCHITECTURE.md`), do início ao fim:

1. **Achar o pedido**: `GET /orders/:id` ou consulta direta — `status` é `PENDING`? Pegar `correlation_id`.
2. **Sem log `outbox.published` para esse pedido** → problema é o relay: `outbox_events.published_at IS NULL` para a linha dele confirma. Causas prováveis: relay parado, ou RabbitMQ fora do ar (`GET /health` mostra `rabbitmq: 'down'`).
3. **`outbox.published` existe, mas sem `order.processing.started`** → mensagem não chegou ao consumer. Ver painel do RabbitMQ Management: mensagens "ready" acumulando na fila `order.created` (nenhum consumer puxando) ou "unacked" (consumer travou sem dar ack/nack). Verificar se o processo worker está de pé e conectado.
4. **`processing.started` existe, sem `order.processed`/`order.failed`/`retry.scheduled` depois** → worker caiu no meio do processamento. A mensagem sem ack volta para a fila automaticamente (RabbitMQ detecta a desconexão); nova tentativa deve gerar novo `processing.started` pouco depois. Se não gerar, o worker está sem conexão com a fila.
5. **`retry.scheduled` repetido várias vezes para o mesmo pedido** → falha técnica recorrente, não trava: o motivo já está no log de cada tentativa (timeout, deadlock, etc.); é questão de esperar esgotar as tentativas (vai para `order.failed` + DLQ) ou corrigir a causa raiz.
6. **DLQ** (`order.created.dlq`) tem a mensagem → tentativas esgotadas; `orders.status = 'FAILED'` com `failure_reason`; reprocessar com `POST /orders/:id/reprocess` (ADMIN) depois de corrigir a causa.

Resumo: outbox sem publicar → relay/RabbitMQ; publicado sem `processing.started` → fila/worker desconectado; `started` sem desfecho → worker caiu (mensagem some da fila e some do log, some volta sozinha); DLQ → esgotado, ver `failure_reason`.
