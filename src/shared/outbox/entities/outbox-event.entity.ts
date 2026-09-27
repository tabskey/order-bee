import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('outbox_events')
export class OutboxEventEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'event_type' })
  eventType: string;

  @Column({ name: 'aggregate_id', type: 'char', length: 36 })
  aggregateId: string;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'char', length: 36 })
  correlationId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt: Date | null;
}
