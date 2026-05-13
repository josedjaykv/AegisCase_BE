import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audit } from './audit.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { EventConsumerController } from './event-consumer.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Audit])],
  controllers: [AuditController, EventConsumerController],
  providers: [AuditService],
})
export class AuditModule {}
