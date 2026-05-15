import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvolvedController } from './involved.controller';
import { InvolvedService } from './involved.service';
import { InvolvedPerson } from './involved-person.entity';
import { CaseInvolvedPerson } from './case-involved-person.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([InvolvedPerson, CaseInvolvedPerson]), EventsModule],
  controllers: [InvolvedController],
  providers: [InvolvedService],
  exports: [InvolvedService],
})
export class InvolvedModule {}
