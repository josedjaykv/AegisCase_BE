import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { DLQ_EXCHANGE, INVESTIGATION_EXCHANGE, getRmqUrl } from '@aegiscase/events';

async function bootstrap() {
  const logger = new Logger('AuditService');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [getRmqUrl()],
      queue: 'audit-service.events',
      queueOptions: {
        durable: true,
        arguments: { 'x-dead-letter-exchange': DLQ_EXCHANGE },
      },
      exchange: INVESTIGATION_EXCHANGE,
      exchangeType: 'topic',
      wildcards: true,
      noAck: false,
      prefetchCount: 1,
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT ?? process.env.AUDIT_PORT ?? 3008;
  await app.listen(port);
  logger.log(`audit-service running on http://localhost:${port}`);
}

bootstrap();
