# ADR-0011 — Guard JWT próprio, sem Passport

- **Status:** Proposto
- **Data:** 2026-09-30
- **Substitui parcialmente:** [ADR-0006](0006-jwt-proprio-com-roles.md), só o item "`JwtStrategy` (Passport) valida o token". O resto do ADR-0006 continua valendo.

## Contexto

A validação do JWT usava Passport: `JwtStrategy` (`passport-jwt`) mais `JwtAuthGuard extends AuthGuard('jwt')`. Eram quatro pacotes (`passport`, `@nestjs/passport`, `passport-jwt` e `@types/passport-jwt`) para uma única strategy HS256. O projeto já usa `jsonwebtoken` para assinar o token em `AuthService`.

## Decisão

- `JwtAuthGuard` implementa `CanActivate` diretamente:
  - lê `Authorization: Bearer <token>`;
  - valida com `verify` do `jsonwebtoken` (`algorithms: ['HS256']`, expiração checada);
  - preenche `request.user` com `{ userId, email, role }`, o mesmo formato que `JwtStrategy.validate` devolvia.
- Token ausente, malformado, com assinatura inválida ou expirado responde `401`.
- `jwt.strategy.ts` e `PassportModule` saem do projeto. `jsonwebtoken` passa a ser dependência de produção.
- `RolesGuard`, `@Roles()` e `@CurrentUser` não mudam.

O ADR-0006 e o ADR-0010 citam `JwtStrategy`. Como ADR aceito não se edita, leia esse nome como `JwtAuthGuard`.

## Integração com SSO

O caminho descrito no ADR-0006 continua o mesmo, só muda o ponto de troca. Em vez de trocar a strategy, troca-se o `verify` do guard por uma validação RS256 com chaves do endpoint JWKS do provedor (`jwks-rsa`), validando `iss` e `aud`.

## Alternativas consideradas

- **Manter Passport:** padrão comum no NestJS, mas a abstração de strategies só paga quando há várias. Aqui há uma.
- **`@nestjs/jwt`:** troca uma dependência por outra para fazer o que `jsonwebtoken`, já presente, faz.

## Consequências

- ✅ Quatro dependências a menos; a validação inteira cabe em um arquivo.
- ✅ Algoritmo fixado explicitamente (`HS256`), sem depender de default de biblioteca.
- ⚠️ Código de segurança próprio: os e2e cobrem token ausente, scheme errado, assinatura inválida e token expirado.
