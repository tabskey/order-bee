import {
  Column,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { UserRole } from '../jwt-payload.interface';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: ['USER', 'ADMIN'] })
  role: UserRole;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}
