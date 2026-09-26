import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { EnvConfig } from '../config/env.schema';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => {
        const correlationIdHeader = config.get('CORRELATION_ID_HEADER', {
          infer: true,
        });
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            genReqId: (req, res) => {
              const existing = req.headers[correlationIdHeader];
              const correlationId = Array.isArray(existing)
                ? existing[0]
                : (existing ?? randomUUID());
              res.setHeader(correlationIdHeader, correlationId);
              return correlationId;
            },
            transport:
              config.get('NODE_ENV', { infer: true }) === 'development'
                ? { target: 'pino-pretty', options: { singleLine: true } }
                : undefined,
          },
        };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
