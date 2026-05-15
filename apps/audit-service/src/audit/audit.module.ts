import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audit } from './audit.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AmqpConsumerService } from './amqp-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Audit])],
  controllers: [AuditController],
  providers: [AuditService, AmqpConsumerService],
})
export class AuditModule {}
