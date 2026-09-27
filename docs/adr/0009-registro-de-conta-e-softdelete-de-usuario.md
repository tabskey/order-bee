# ADR-0009 — Registro de conta, soft delete e promoção de role de usuário

- **Status:** Aceito
- **Data:** 2026-09-27

## Contexto

Hoje só existem usuários via seed. Faltava uma rota para criar conta, uma forma de um ADMIN remover a conta de outro usuário sem quebrar o histórico de pedidos (`orders.created_by` é FK para `users`), e um fluxo para promover/rebaixar a role de um usuário com rastreabilidade de quem fez a mudança.

## Decisão

### Criação de conta — `POST /auth/register`

- Rota pública (sem JWT).
- Body: `{ email, password }`. `role` não é aceito no payload — toda conta criada por esta rota nasce `USER`. Isso evita escalação de privilégio via auto-registro.
- `201` com `{ id, email, role: "USER" }`. `409` se `email` já existe.
- Senha com `bcrypt` (mesmo utilitário de `shared/security/password.util`, já usado no login).

Contas `ADMIN` continuam existindo só via seed nesta etapa; a única forma de criar uma nova conta `ADMIN` é outro `ADMIN` promover uma conta `USER` existente via `PATCH /users/:id/role` (seção seguinte).

### Remoção de conta — `DELETE /users/:id`

- Exige role `ADMIN` (`RolesGuard` + `@Roles('ADMIN')`).
- **Soft delete apenas**: seta `users.deleted_at = NOW()` via `@DeleteDateColumn`. Nunca `DELETE` físico.
- `204` sem corpo. `404` se o usuário não existe **ou** já está com `deleted_at` preenchido (não distinguir os dois casos).
- `400` se `:id` for o próprio ADMIN autenticado (evita lockout de todos os admins).
- Login (`AuthService.login`) usa `findOneBy`, que o TypeORM já filtra por `deleted_at IS NULL` automaticamente por causa do `@DeleteDateColumn` — conta soft-deletada não autentica mais, sem filtro manual.
- Token já emitido antes do delete continua válido até expirar (15 min): não há revogação de token, limitação já registrada no ADR-0006. Aceitável pelo mesmo motivo.

### Promoção de role — `PATCH /users/:id/role`

- Exige role `ADMIN`. Body: `{ role: "USER" | "ADMIN" }`.
- `400` se `:id` for o próprio ADMIN autenticado — mesma proteção contra lockout do soft delete: um admin não pode se auto-rebaixar nem, por simetria, se auto-promover (já é admin).
- `404` se o usuário não existe ou está soft-deletado (`deleted_at IS NULL` na condição do UPDATE).
- **Toda mudança de role gera uma linha de auditoria** na tabela `user_role_changes`: quem mudou (`changed_by`), de quem (`user_id`), role anterior e nova, e quando. UPDATE da role e INSERT do log de auditoria acontecem na mesma transação (o `SELECT ... FOR UPDATE` prévio lê a role anterior de forma consistente).
- Log estruturado (`event: 'user.role_changed'`) também é emitido, no mesmo padrão dos eventos de `order-processing.service.ts`.
- Sem endpoint de leitura da auditoria por enquanto — só persistência. Adicionar quando houver necessidade real de consulta.

### Schema

`users` ganha coluna nova, e uma tabela nova guarda o histórico de mudança de role:

```sql
ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL;

CREATE TABLE user_role_changes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  changed_by INT NOT NULL,
  old_role ENUM('USER', 'ADMIN') NOT NULL,
  new_role ENUM('USER', 'ADMIN') NOT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_role_changes_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_user_role_changes_changed_by FOREIGN KEY (changed_by) REFERENCES users(id)
) ENGINE=InnoDB;
```

Nenhuma FK existente muda. `orders.created_by` continua apontando para a linha do usuário soft-deletado — histórico intacto.

## Alternativas consideradas

- **Hard delete com `ON DELETE SET NULL` em `orders.created_by`**: perde a auditoria de quem criou o pedido. Rejeitado.
- **Tabela separada de usuários removidos**: mais uma tabela para um caso simples; `deleted_at` nulável resolve com uma coluna.
- **Tabela genérica de audit log** (para qualquer entidade, não só role de usuário): mais flexível, mas não há outro caso de uso hoje; `user_role_changes` dedicada é mais simples e não precisa de coluna `entity_type`/`payload` genérica especulativa.

## Consequências

- ✅ Histórico de pedidos preservado mesmo após remoção de conta.
- ✅ Promoção a ADMIN sempre auditada (quem, quem, quando).
- ✅ Sem risco de um ADMIN se auto-rebaixar/auto-deletar e travar a administração do sistema.
- ⚠️ Sem revogação de token: conta deletada ou rebaixada mantém acesso (com a role antiga) pelo tempo restante do JWT já emitido.
- ⚠️ Sem endpoint de consulta do log de auditoria; hoje só é acessível via banco.
