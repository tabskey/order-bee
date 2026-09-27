import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import type {
  AuthenticatedUser,
  UserRole,
} from '../auth/jwt-payload.interface';
import { UserRoleChangeEntity } from './entities/user-role-change.entity';

interface RoleRow {
  role: UserRole;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async softDelete(
    targetId: number,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    if (targetId === currentUser.userId) {
      throw new BadRequestException('Admins cannot delete their own account');
    }

    const result = await this.users
      .createQueryBuilder()
      .softDelete()
      .where('id = :id', { id: targetId })
      .andWhere('deleted_at IS NULL')
      .execute();
    if (!result.affected) {
      throw new NotFoundException(`User ${targetId} not found`);
    }
  }

  async changeRole(
    targetId: number,
    newRole: UserRole,
    currentUser: AuthenticatedUser,
  ): Promise<{ id: number; email: string; role: UserRole }> {
    if (targetId === currentUser.userId) {
      throw new BadRequestException('Admins cannot change their own role');
    }

    const oldRole = await this.dataSource.transaction(async (manager) => {
      const rows: RoleRow[] = await manager.query(
        `SELECT role FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
        [targetId],
      );
      if (rows.length === 0) {
        throw new NotFoundException(`User ${targetId} not found`);
      }

      await manager.query(
        `UPDATE users SET role = ? WHERE id = ? AND deleted_at IS NULL`,
        [newRole, targetId],
      );

      await manager.insert(UserRoleChangeEntity, {
        userId: targetId,
        changedBy: currentUser.userId,
        oldRole: rows[0].role,
        newRole,
      });

      return rows[0].role;
    });

    this.logger.log({
      event: 'user.role_changed',
      userId: targetId,
      changedBy: currentUser.userId,
      oldRole,
      newRole,
    });

    const user = await this.users.findOneByOrFail({ id: targetId });
    return { id: user.id, email: user.email, role: user.role };
  }
}
