import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { InvolvementType } from '@aegiscase/enums';
import { InvolvedPerson } from './involved-person.entity';

@Entity('case_involved_persons', { schema: 'involved_db' })
export class CaseInvolvedPerson {
  @PrimaryColumn({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @PrimaryColumn({ name: 'involved_person_id', type: 'uuid' })
  involvedPersonId: string;

  @Column({ name: 'involvement_type', type: 'enum', enum: InvolvementType })
  involvementType: InvolvementType;

  @Column({ type: 'text', nullable: true })
  observations: string | null;

  @ManyToOne(() => InvolvedPerson, (p) => p.caseLinks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'involved_person_id' })
  involvedPerson: InvolvedPerson;
}
