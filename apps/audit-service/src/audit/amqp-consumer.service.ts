import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import { ConsumeMessage } from 'amqplib';
import { INVESTIGATION_EXCHANGE, DLQ_EXCHANGE, getRmqUrl, BaseEvent } from '@aegiscase/events';
import { AuditService } from './audit.service';

const QUEUE = 'audit-service.events';

@Injectable()
export class AmqpConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AmqpConsumerService.name);
  private connection: AmqpConnectionManager;
  private channel: ChannelWrapper;

  constructor(private readonly auditService: AuditService) {}

  async onModuleInit() {
    this.connection = connect([getRmqUrl()]);

    this.channel = this.connection.createChannel({
      setup: async (ch: any) => {
        await ch.assertExchange(INVESTIGATION_EXCHANGE, 'topic', { durable: true });
        await ch.assertExchange(DLQ_EXCHANGE, 'topic', { durable: true });

        await ch.assertQueue(QUEUE, {
          durable: true,
          arguments: { 'x-dead-letter-exchange': DLQ_EXCHANGE },
        });

        // Bind with '#' to receive every routing key published to the exchange
        await ch.bindQueue(QUEUE, INVESTIGATION_EXCHANGE, '#');

        await ch.prefetch(1);

        await ch.consume(QUEUE, (msg: ConsumeMessage | null) => {
          if (!msg) return;
          this.handleMessage(ch, msg);
        });
      },
    });

    await this.channel
      .waitForConnect()
      .catch((err) => this.logger.warn(`RabbitMQ connect failed: ${err?.message}`));

    this.logger.log('AMQP consumer connected — listening on audit-service.events');
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  private async handleMessage(ch: any, msg: ConsumeMessage): Promise<void> {
    let event: BaseEvent;
    try {
      event = JSON.parse(msg.content.toString()) as BaseEvent;
    } catch {
      this.logger.error('Failed to parse message — sending to DLQ');
      ch.nack(msg, false, false);
      return;
    }

    try {
      this.logger.log(`Consumed ${event.event_type} [${event.entity_id}]`);
      await this.auditService.record(event);
      ch.ack(msg);
    } catch (err) {
      this.logger.error(`Failed to process ${event.event_type}: ${err?.message}`, err?.stack);
      ch.nack(msg, false, false); // don't requeue → goes to DLQ after max retries
    }
  }
}
