import { INestApplication, Type, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AllExceptionsFilter } from '@aegiscase/common';

/**
 * Bootstraps a service's AppModule in-process with the same global pipes/filters as production main.ts.
 * Callers pass the AppModule class itself (requiring it lazily after applyInfraEnv runs).
 */
export async function bootstrapApp(AppModule: Type<unknown>): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return app;
}

export const POLL_INTERVAL_MS = 250;
export const POLL_TIMEOUT_MS = 15_000;

export async function pollUntil<T>(
  fn: () => Promise<T | null | undefined>,
  label: string,
  timeoutMs: number = POLL_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}
