import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  validateSync,
} from 'class-validator';

export class EnvConfig {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DB_HOST: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  DB_PORT = 3306;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string;

  @IsString()
  @IsNotEmpty()
  DB_DATABASE: string;

  @IsString()
  @IsNotEmpty()
  RABBITMQ_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  JWT_EXPIRES_IN = '15m';

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID: string;

  @Transform(({ value }) =>
    value === undefined
      ? undefined
      : String(value)
          .split(',')
          .map((item: string) => Number(item.trim())),
  )
  @IsArray()
  @IsInt({ each: true })
  RETRY_DELAYS_MS: number[] = [1000, 5000, 25000];

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
  LOG_LEVEL = 'info';

  @IsString()
  CORRELATION_ID_HEADER = 'x-correlation-id';
}

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const validated = plainToInstance(EnvConfig, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated);
  if (errors.length > 0) {
    const issues = errors
      .map(
        (error) =>
          `- ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return validated;
}
