import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INVESTIGATION_EXCHANGE, RABBITMQ_CLIENT, getRmqUrl } from '@aegiscase/events';
import { EventPublisherService } from './event-publisher.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: RABBITMQ_CLIENT,
        imports: [ConfigModule],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [getRmqUrl()],
            queue: 'task-service.events',
            queueOptions: { durable: true },
            exchange: INVESTIGATION_EXCHANGE,
            exchangeType: 'topic',
            wildcards: true,
            persistent: true,
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [EventPublisherService],
  exports: [EventPublisherService],
})
export class EventsModule {}
