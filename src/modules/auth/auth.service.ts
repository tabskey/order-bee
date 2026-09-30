import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { sign } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import type { EnvConfig } from '../../shared/config/env.schema';
import {
  hashPassword,
  verifyPassword,
} from '../../shared/security/password.util';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserEntity } from './entities/user.entity';
import type { JwtPayload, UserRole } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {
    this.googleClient = new OAuth2Client(this.config.get('GOOGLE_CLIENT_ID'));
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.users.findOneBy({ email: dto.email });
    const valid = user
      ? await verifyPassword(dto.password, user.passwordHash)
      : false;
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { accessToken: this.signToken(user) };
  }

  async loginWithGoogle(dto: GoogleLoginDto): Promise<{ accessToken: string }> {
    const ticket = await this.googleClient
      .verifyIdToken({
        idToken: dto.idToken,
        audience: this.config.get('GOOGLE_CLIENT_ID'),
      })
      .catch((err: Error) => {
        this.logger.warn(`Google ID token rejected: ${err.message}`);
        return null;
      });
    const payload = ticket?.getPayload();
    if (!payload?.email || !payload.email_verified) {
      throw new UnauthorizedException('Invalid Google ID token');
    }

    const user =
      (await this.findByEmailWithDeleted(payload.email)) ??
      (await this.provisionGoogleUser(payload.email));
    // A soft-deleted account must not come back through SSO (ADR-0009).
    if (user.deletedAt) {
      throw new UnauthorizedException('Account disabled');
    }

    return { accessToken: this.signToken(user) };
  }

  private findByEmailWithDeleted(email: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { email }, withDeleted: true });
  }

  private async provisionGoogleUser(email: string): Promise<UserEntity> {
    // ponytail: placeholder hash keeps password_hash NOT NULL without a schema
    // change; Google-provisioned users just never log in with a password.
    const passwordHash = await hashPassword(randomUUID());
    try {
      await this.users.insert({ email, passwordHash, role: 'USER' });
    } catch (error) {
      // Concurrent first login with the same email: the other request won.
      if ((error as { code?: string }).code !== 'ER_DUP_ENTRY') {
        throw error;
      }
    }
    return this.users.findOneOrFail({ where: { email }, withDeleted: true });
  }

  private signToken(user: UserEntity): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return sign(payload, this.config.get('JWT_SECRET'), {
      expiresIn: this.config.get('JWT_EXPIRES_IN'),
    });
  }

  async register(
    dto: RegisterDto,
  ): Promise<{ id: number; email: string; role: UserRole }> {
    const existing = await this.users.findOneBy({ email: dto.email });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hashPassword(dto.password);
    const role: UserRole = 'USER';
    const inserted = await this.users.insert({
      email: dto.email,
      passwordHash,
      role,
    });
    const id = inserted.identifiers[0].id as number;
    return { id, email: dto.email, role };
  }
}
