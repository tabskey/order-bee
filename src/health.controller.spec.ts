import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { RabbitmqConnection } from './shared/messaging/rabbitmq-connection';

describe('HealthController', () => {
  async function buildController(
    dbQuery: () => Promise<unknown>,
    rabbitConnected: boolean,
  ): Promise<HealthController> {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: getDataSourceToken(),
          useValue: { isInitialized: true, query: dbQuery },
        },
        {
          provide: RabbitmqConnection,
          useValue: { isConnected: () => rabbitConnected },
        },
      ],
    }).compile();

    return module.get<HealthController>(HealthController);
  }

  it('returns ok when db and rabbitmq are up', async () => {
    const controller = await buildController(() => Promise.resolve(), true);
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      rabbitmq: 'up',
    });
  });

  it('returns degraded when rabbitmq is down but db is up', async () => {
    const controller = await buildController(() => Promise.resolve(), false);
    await expect(controller.check()).resolves.toEqual({
      status: 'degraded',
      db: 'up',
      rabbitmq: 'down',
    });
  });

  it('throws 503 when db is down', async () => {
    const controller = await buildController(
      () => Promise.reject(new Error('connection lost')),
      true,
    );
    await expect(controller.check()).rejects.toThrow(HttpException);
    try {
      await controller.check();
      throw new Error('expected check() to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(503);
      expect(httpError.getResponse()).toEqual({
        status: 'degraded',
        db: 'down',
        rabbitmq: 'up',
      });
    }
  });
});
