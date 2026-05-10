import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { Case } from './case.entity';
import { CaseTeam } from './case-team.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Case, CaseTeam])],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
