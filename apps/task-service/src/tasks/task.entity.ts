import { Column, Entity, Index } from 'typeorm';
import { AegisBaseEntity } from '@aegiscase/database';
import { TaskStatus, TaskPriority } from '@aegiscase/enums';

@Entity('tasks', { schema: 'task_db' })
export class Task extends AegisBaseEntity {
  @Index()
  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: TaskPriority })
  priority: TaskPriority;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.PENDING })
  status: TaskStatus;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Index()
  @Column({ name: 'assigned_to_user_id', type: 'uuid' })
  assignedToUserId: string;

  @Column({ name: 'assigned_by_user_id', type: 'uuid' })
  assignedByUserId: string;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId: string;
}
