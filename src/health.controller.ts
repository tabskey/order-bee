import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RabbitmqConnection } from './shared/messaging/rabbitmq-connection';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  rabbitmq: 'up' | 'down';
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rabbit: RabbitmqConnection,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const dbUp = await this.isDbUp();
    const rabbitUp = this.rabbit.isConnected();
    const body: HealthResponse = {
      status: dbUp && rabbitUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      rabbitmq: rabbitUp ? 'up' : 'down',
    };

    if (!dbUp) {
      throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return body;
  }

  private async isDbUp(): Promise<boolean> {
    try {
      if (!this.dataSource.isInitialized) {
        return false;
      }
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
