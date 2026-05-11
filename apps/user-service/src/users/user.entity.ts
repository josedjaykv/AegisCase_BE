import { Column, Entity, Index } from 'typeorm';
import { AegisBaseEntity } from '@aegiscase/database';
import { UserRole } from '@aegiscase/enums';

@Entity('users', { schema: 'user_db' })
export class User extends AegisBaseEntity {
  @Index({ unique: true })
  @Column({ name: 'keycloak_user_id' })
  keycloakUserId: string;

  @Column({ name: 'first_names' })
  firstNames: string;

  @Column({ name: 'last_names' })
  lastNames: string;

  @Index({ unique: true })
  @Column()
  document: string;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ name: 'job_title', nullable: true })
  jobTitle: string | null;
}
