export const INVESTIGATION_EXCHANGE = 'investigation-system';
export const DLQ_EXCHANGE = 'dlq.investigation-system';
export const RABBITMQ_CLIENT = 'RABBITMQ_CLIENT';

export function getRmqUrl(): string {
  return (
    process.env.RABBITMQ_URL ||
    `amqp://${process.env.RABBITMQ_USER ?? 'aegiscase'}:${process.env.RABBITMQ_PASSWORD ?? 'aegiscase'}` +
    `@${process.env.RABBITMQ_HOST ?? 'localhost'}:${process.env.RABBITMQ_PORT ?? '5672'}` +
    `/${process.env.RABBITMQ_VHOST ?? 'aegiscase'}`
  );
}
