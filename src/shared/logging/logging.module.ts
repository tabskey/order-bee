import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { LoggerModule } from 'nestjs-pino';
import type { EnvConfig } from '../config/env.schema';

const CORRELATION_ID_HEADER = 'x-correlation-id';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          genReqId: (req, res) => {
            const header = req.headers[CORRELATION_ID_HEADER];
            const existing = Array.isArray(header) ? header[0] : header;
            // Stored in CHAR(36) columns and echoed into logs: only a UUID
            // from the client is trusted, anything else gets a fresh one.
            const correlationId =
              existing && isUUID(existing) ? existing : randomUUID();
            res.setHeader(CORRELATION_ID_HEADER, correlationId);
            return correlationId;
          },
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
