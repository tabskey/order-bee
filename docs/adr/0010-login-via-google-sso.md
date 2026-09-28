# ADR-0010 — Login via Google (SSO real, aditivo ao JWT local)

- **Status:** Aceito
- **Data:** 2026-09-27

## Contexto

ADR-0006 decidiu deixar SSO **descrito, não implementado**: full switch de `JwtStrategy` para RS256/JWKS, API virando resource-server, `password_hash` removido. Trade-off aceito por custo alto (Keycloak/Auth0 no compose) frente a pouco ganho de avaliação.

Bônus pede SSO de verdade. Full switch do ADR-0006 é desproporcional para o objetivo: descartaria login local funcionando e a tabela `password_hash` só para trocar por um único provedor.

## Decisão

- Login via Google é **aditivo**, não substitui login local nem o ADR-0006.
- Novo endpoint `POST /auth/google` recebe `idToken` emitido pelo Google (client já autenticou no front).
- Backend valida o `idToken` via `google-auth-library` (JWKS oficial do Google, valida assinatura, `iss`, `aud` = `GOOGLE_CLIENT_ID`).
- E-mail do payload do Google é usado para *upsert* de usuário local: se existir, reusa; se não existir, cria com `role: 'USER'` (mesmo padrão do `register`).
- Endpoint emite o mesmo JWT HS256 já usado hoje (`sub`, `email`, `role`). `JwtStrategy`, `RolesGuard`, `@Roles()` não mudam.
- `POST /auth/login` e `password_hash` continuam existindo — usuário sem conta Google também loga com senha.

## Alternativas consideradas

- **Full resource-server (ADR-0006 tal como descrito):** API só valida token do provedor, sem emitir JWT próprio. Rejeitado agora: quebraria login local existente e exigiria dropar `password_hash`, custo maior que o bônus pede.
- **`passport-google-oauth20` com fluxo OAuth completo (redirect/callback no backend):** mais próximo de "SSO clássico", mas exige `GOOGLE_CLIENT_SECRET`, callback URL pública e sessão. Rejeitado: complexidade de infra desproporcional para demonstrar o conceito; `idToken` client-side + verificação server-side cobre o mesmo requisito de forma mais simples.

## Consequências

- ✅ Login local intocado; SSO é opt-in por usuário.
- ✅ Guards e emissão de token reaproveitados; superfície nova é só validação do `idToken` + upsert.
- ⚠️ Nova dependência de produção: `google-auth-library` (aguarda aprovação antes de `npm install`).
- ⚠️ Sem link/unlink explícito de conta: e-mail do Google que colidir com conta local existente vira login automático dessa conta — aceitável para o bônus, mas é uma superfície de confiança implícita no e-mail verificado pelo Google.
