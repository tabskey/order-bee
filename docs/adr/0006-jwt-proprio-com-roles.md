# ADR-0006 — JWT próprio com roles

- **Status:** Aceito
- **Data:** 2026-09-24

## Contexto

O teste pede JWT com usuário de teste e controle por role; SSO é opcional, bastando descrever a integração.

## Decisão

- `POST /auth/login` valida e-mail e senha (bcrypt) e emite JWT HS256, expiração de 15 min, com `sub`, `email` e `role`.
- `JwtStrategy` (Passport) valida o token; `RolesGuard` + decorator `@Roles()` aplicam a autorização.
- Roles: `USER` (criar e consultar pedidos) e `ADMIN` (também reprocessar).
- Seed cria `user@test.local` e `admin@test.local`. Segredo via variável de ambiente.

## Alternativas consideradas

- **Keycloak no Compose**: demonstra SSO de verdade, mas adiciona realm, client e import de configuração, com pouco ganho na avaliação frente ao custo.

## Integração com SSO (descrita no README)

Troca da estratégia, sem tocar em controllers nem guards:

- `JwtStrategy` passa a validar RS256 com chaves obtidas do endpoint JWKS do provedor (`jwks-rsa`, com cache).
- Validação de `iss` e `aud`; roles extraídas de `realm_access.roles` (Keycloak) ou de uma claim customizada (Auth0).
- `POST /auth/login` e a tabela `password_hash` deixam de existir; a API vira apenas *resource server*.

## Consequências

- ✅ Simples de rodar e testar; autorização por role demonstrada.
- ✅ Guards independentes do emissor do token: migrar para SSO troca só a strategy.
- ⚠️ Sem refresh token nem revogação; fica como melhoria futura.
