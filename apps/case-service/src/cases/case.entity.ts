import { Column, Entity, Index, OneToMany } from 'typeorm';
import { AegisBaseEntity } from '@aegiscase/database';
import { CaseStatus, CasePriority } from '@aegiscase/enums';
import { CaseTeam } from './case-team.entity';

@Entity('cases', { schema: 'case_db' })
export class Case extends AegisBaseEntity {
  @Index({ unique: true })
  @Column({ name: 'case_code' })
  caseCode: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: CasePriority })
  priority: CasePriority;

  @Column({ type: 'enum', enum: CaseStatus, default: CaseStatus.OPEN })
  status: CaseStatus;

  @Column({ name: 'leader_user_id', type: 'uuid' })
  leaderUserId: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ default: false })
  archived: boolean;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @OneToMany(() => CaseTeam, (team) => team.case, { cascade: true })
  team: CaseTeam[];
}
