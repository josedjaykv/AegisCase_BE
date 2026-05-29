import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import {
  RabbitMQContainer,
  StartedRabbitMQContainer,
} from '@testcontainers/rabbitmq';
import { Client } from 'pg';

const SCHEMAS = [
  'user_db',
  'case_db',
  'involved_db',
  'evidence_db',
  'task_db',
  'media_db',
  'audit_db',
];

export interface E2EInfra {
  postgres: StartedPostgreSqlContainer;
  rabbitmq: StartedRabbitMQContainer;
  postgresUrl: string;
  rabbitmqUrl: string;
  stop: () => Promise<void>;
}

export async function startInfra(): Promise<E2EInfra> {
  const [postgres, rabbitmq] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('aegiscase')
      .withUsername('aegiscase')
      .withPassword('aegiscase')
      .start(),
    new RabbitMQContainer('rabbitmq:3.13-management-alpine').start(),
  ]);

  // Pre-create the per-service schemas that DatabaseModule.forRoot(<schema>) expects.
  const pg = new Client({ connectionString: postgres.getConnectionUri() });
  await pg.connect();
  for (const schema of SCHEMAS) {
    await pg.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  }
  await pg.end();

  return {
    postgres,
    rabbitmq,
    postgresUrl: postgres.getConnectionUri(),
    rabbitmqUrl: rabbitmq.getAmqpUrl(),
    stop: async () => {
      await Promise.allSettled([postgres.stop(), rabbitmq.stop()]);
    },
  };
}

export function applyInfraEnv(infra: E2EInfra): void {
  // Force the HS256 fallback in JwtStrategy (no Keycloak in the loop).
  // Empty string keeps the key "set" so the .env loaded by ConfigModule does NOT override it
  // (dotenv skips keys that already exist on process.env). JwtStrategy treats it as falsy.
  process.env.KEYCLOAK_URL = '';
  process.env.JWT_SECRET = 'e2e-test-secret';
  process.env.NODE_ENV = 'test'; // keeps `synchronize: true` enabled
  process.env.DB_HOST = infra.postgres.getHost();
  process.env.DB_PORT = String(infra.postgres.getMappedPort(5432));
  process.env.DB_USER = infra.postgres.getUsername();
  process.env.DB_PASSWORD = infra.postgres.getPassword();
  process.env.DB_NAME = infra.postgres.getDatabase();
  process.env.RABBITMQ_URL = infra.rabbitmqUrl;
}
