import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { UserRole } from '../../auth/jwt-payload.interface';

@Entity('user_role_changes')
export class UserRoleChangeEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'changed_by' })
  changedBy: number;

  @Column({ name: 'old_role', type: 'enum', enum: ['USER', 'ADMIN'] })
  oldRole: UserRole;

  @Column({ name: 'new_role', type: 'enum', enum: ['USER', 'ADMIN'] })
  newRole: UserRole;

  @Column({
    name: 'changed_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  changedAt: Date;
}
