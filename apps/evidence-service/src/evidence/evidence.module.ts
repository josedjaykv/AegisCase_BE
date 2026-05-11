import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';
import { Evidence } from './evidence.entity';
import { ChainOfCustody } from './chain-of-custody.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Evidence, ChainOfCustody])],
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
