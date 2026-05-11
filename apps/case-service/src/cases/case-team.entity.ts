import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { TeamRole } from '@aegiscase/enums';
import { Case } from './case.entity';

@Entity('case_team', { schema: 'case_db' })
export class CaseTeam {
  @PrimaryColumn({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'team_role', type: 'enum', enum: TeamRole })
  teamRole: TeamRole;

  @CreateDateColumn({ name: 'linked_at', type: 'timestamptz' })
  linkedAt: Date;

  @ManyToOne(() => Case, (c) => c.team, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'case_id' })
  case: Case;
}
