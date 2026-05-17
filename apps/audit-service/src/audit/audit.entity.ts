import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit', { schema: 'audit_db' })
export class Audit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'event_id' })
  eventId: string;

  @Index()
  @Column({ name: 'user_id' })
  userId: string;

  @Index()
  @Column()
  action: string;

  @Index()
  @Column({ name: 'entity_type' })
  entityType: string;

  @Index()
  @Column({ name: 'entity_id' })
  entityId: string;

  @Column({ name: 'previous_state', type: 'jsonb', nullable: true })
  previousState: Record<string, any> | null;

  @Column({ name: 'new_state', type: 'jsonb', nullable: true })
  newState: Record<string, any> | null;

  @Column({ name: 'event_payload', type: 'jsonb', nullable: true })
  eventPayload: Record<string, any> | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
