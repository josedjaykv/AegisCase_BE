import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Evidence } from './evidence.entity';

@Entity('chain_of_custody', { schema: 'evidence_db' })
export class ChainOfCustody {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'evidence_id', type: 'uuid' })
  evidenceId: string;

  @Column({ name: 'previous_custodian_id', type: 'uuid', nullable: true })
  previousCustodianId: string | null;

  @Column({ name: 'new_custodian_id', type: 'uuid' })
  newCustodianId: string;

  @Column({ name: 'transferred_by_user_id', type: 'uuid' })
  transferredByUserId: string;

  @Column({ name: 'transfer_reason', type: 'text', nullable: true })
  transferReason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Evidence, (e) => e.custodyChain, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evidence_id' })
  evidence: Evidence;
}
