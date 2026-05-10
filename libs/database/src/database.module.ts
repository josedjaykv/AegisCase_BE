import { Module, DynamicModule } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module({})
export class DatabaseModule {
  static forRoot(schema: string): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: (config: ConfigService): TypeOrmModuleOptions => ({
            type: 'postgres',
            host: config.get('DB_HOST', 'localhost'),
            port: config.get<number>('DB_PORT', 5432),
            username: config.get('DB_USER', 'aegiscase'),
            password: config.get('DB_PASSWORD', 'aegiscase'),
            database: config.get('DB_NAME', 'aegiscase'),
            schema,
            entities: [__dirname + '/../**/*.entity{.ts,.js}'],
            synchronize: config.get('NODE_ENV') !== 'production',
            logging: config.get('DB_LOGGING', 'false') === 'true',
            ssl: config.get('DB_SSL', 'false') === 'true' ? { rejectUnauthorized: false } : false,
          }),
          inject: [ConfigService],
        }),
      ],
      exports: [TypeOrmModule],
    };
  }
}
