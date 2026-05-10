import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvolvedController } from './involved.controller';
import { InvolvedService } from './involved.service';
import { InvolvedPerson } from './involved-person.entity';
import { CaseInvolvedPerson } from './case-involved-person.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InvolvedPerson, CaseInvolvedPerson])],
  controllers: [InvolvedController],
  providers: [InvolvedService],
  exports: [InvolvedService],
})
export class InvolvedModule {}
