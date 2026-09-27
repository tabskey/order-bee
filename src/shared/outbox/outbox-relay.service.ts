import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagePublisher } from '../messaging/message-publisher';
import { ORDER_CREATED_ROUTING_KEY } from '../messaging/topology';
import { OutboxEventEntity } from './entities/outbox-event.entity';

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 50;

@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: MessagePublisher,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.relayBatch();
    } catch (error) {
      this.logger.error('Failed to relay outbox batch', error);
    } finally {
      this.running = false;
    }
  }

  private async relayBatch(): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const events = await manager
        .createQueryBuilder(OutboxEventEntity, 'event')
        .where('event.publishedAt IS NULL')
        .orderBy('event.id', 'ASC')
        .limit(BATCH_SIZE)
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getMany();

      if (events.length === 0) {
        return;
      }

      for (const event of events) {
        await this.publisher.publish(ORDER_CREATED_ROUTING_KEY, event.payload, {
          'x-attempt': 0,
        });
        this.logger.log({
          event: 'outbox.published',
          orderId: event.aggregateId,
          correlationId: event.correlationId,
          eventType: event.eventType,
        });
      }

      await manager
        .createQueryBuilder()
        .update(OutboxEventEntity)
        .set({ publishedAt: () => 'NOW()' })
        .whereInIds(events.map((event) => event.id))
        .execute();
    });
  }
}
