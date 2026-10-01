import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify } from 'jsonwebtoken';
import type { EnvConfig } from '../../shared/config/env.schema';
import type { AuthenticatedUser, JwtPayload } from './jwt-payload.interface';

// ADR-0011: verifies the HS256 bearer token and sets `request.user`, which
// RolesGuard and @CurrentUser read.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: AuthenticatedUser;
    }>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException();
    }

    try {
      const { sub, email, role } = verify(
        token,
        this.config.get('JWT_SECRET'),
        { algorithms: ['HS256'] },
      ) as unknown as JwtPayload;
      request.user = { userId: sub, email, role };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
