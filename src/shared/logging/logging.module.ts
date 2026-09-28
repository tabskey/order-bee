import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
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
              const header = req.headers[correlationIdHeader];
              const existing = Array.isArray(header) ? header[0] : header;
              // Stored in CHAR(36) columns and echoed into logs: only a UUID
              // from the client is trusted, anything else gets a fresh one.
              const correlationId =
                existing && isUUID(existing) ? existing : randomUUID();
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
