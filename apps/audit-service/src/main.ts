import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('AuditService');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT ?? process.env.AUDIT_PORT ?? 3008;
  await app.listen(port);
  logger.log(`audit-service running on http://localhost:${port}`);
}

bootstrap();
