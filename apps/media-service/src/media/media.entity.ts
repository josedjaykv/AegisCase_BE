import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { MediaEntityType } from '@aegiscase/enums';

@Entity('media', { schema: 'media_db' })
export class Media {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 1000 })
  url: string;

  @Index()
  @Column({ name: 'entity_type', type: 'enum', enum: MediaEntityType })
  entityType: MediaEntityType;

  @Index()
  @Column({ name: 'entity_id' })
  entityId: string;

  @Index()
  @Column({ name: 'uploaded_by_user_id' })
  uploadedByUserId: string;

  @Column({ name: 'original_filename', nullable: true })
  originalFilename: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'file_size', type: 'integer', nullable: true })
  fileSize: number | null;

  @Column({ name: 'mime_type', nullable: true })
  mimeType: string | null;

  @Column({ name: 's3_key', length: 1000 })
  s3Key: string;

  @Column({ default: false })
  deleted: boolean;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
