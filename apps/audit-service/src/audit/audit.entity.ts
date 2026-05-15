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

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
