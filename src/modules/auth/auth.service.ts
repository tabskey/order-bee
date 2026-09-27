import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { sign } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import type { EnvConfig } from '../../shared/config/env.schema';
import {
  hashPassword,
  verifyPassword,
} from '../../shared/security/password.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserEntity } from './entities/user.entity';
import type { JwtPayload, UserRole } from './jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.users.findOneBy({ email: dto.email });
    const valid = user
      ? await verifyPassword(dto.password, user.passwordHash)
      : false;
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = sign(payload, this.config.get('JWT_SECRET'), {
      expiresIn: this.config.get('JWT_EXPIRES_IN'),
    });
    return { accessToken };
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
