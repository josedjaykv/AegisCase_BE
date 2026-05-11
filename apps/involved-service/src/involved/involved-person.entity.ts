import { Column, Entity, Index, OneToMany } from 'typeorm';
import { AegisBaseEntity } from '@aegiscase/database';
import { CaseInvolvedPerson } from './case-involved-person.entity';

@Entity('involved_persons', { schema: 'involved_db' })
export class InvolvedPerson extends AegisBaseEntity {
  @Column({ name: 'first_names' })
  firstNames: string;

  @Column({ name: 'last_names', nullable: true })
  lastNames: string | null;

  @Index({ unique: true, sparse: true })
  @Column({ nullable: true })
  document: string | null;

  @Column({ type: 'text', nullable: true })
  observations: string | null;

  @OneToMany(() => CaseInvolvedPerson, (cip) => cip.involvedPerson, { cascade: true })
  caseLinks: CaseInvolvedPerson[];
}
