import { Column, Entity, Index, OneToMany } from 'typeorm';
import { AegisBaseEntity } from '@aegiscase/database';
import { EvidenceType, EvidenceStatus } from '@aegiscase/enums';
import { ChainOfCustody } from './chain-of-custody.entity';

@Entity('evidence', { schema: 'evidence_db' })
export class Evidence extends AegisBaseEntity {
  @Index()
  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @Column({ name: 'evidence_type', type: 'enum', enum: EvidenceType })
  evidenceType: EvidenceType;

  @Column({ type: 'varchar', length: 200, nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({
    name: 'evidence_status',
    type: 'enum',
    enum: EvidenceStatus,
    default: EvidenceStatus.REGISTERED,
  })
  evidenceStatus: EvidenceStatus;

  @Column({ name: 'current_custodian_id', type: 'uuid', nullable: true })
  currentCustodianId: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;

  @Column({ default: false })
  archived: boolean;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @OneToMany(() => ChainOfCustody, (coc) => coc.evidence, { cascade: true })
  custodyChain: ChainOfCustody[];
}
