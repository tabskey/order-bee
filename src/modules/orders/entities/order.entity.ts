import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderStatus } from '../domain/order-status.enum';

@Entity('orders')
export class OrderEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id: string;

  @Column({ name: 'created_by' })
  createdBy: number;

  @Column({ name: 'customer_name' })
  customerName: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: string;

  @Column({ type: 'enum', enum: OrderStatus })
  status: OrderStatus;

  @Column({ name: 'failure_reason', type: 'varchar', nullable: true })
  failureReason: string | null;

  @Column({ name: 'correlation_id', type: 'char', length: 36 })
  correlationId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'processed_at', type: 'datetime', nullable: true })
  processedAt: Date | null;
}
