import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserEntity } from './entities/user.entity';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [PassportModule, TypeOrmModule.forFeature([UserEntity])],
  controllers: [AuthController],
  providers: [JwtStrategy, AuthService, RolesGuard],
  exports: [RolesGuard],
})
export class AuthModule {}
