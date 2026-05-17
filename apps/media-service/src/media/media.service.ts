import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { Media } from './media.entity';
import { S3Service } from './s3.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { EventPublisherService } from '../events/event-publisher.service';
import { MediaEntityType } from '@aegiscase/enums';

const ENTITY_FOLDER: Record<MediaEntityType, string> = {
  [MediaEntityType.CASE]: 'cases',
  [MediaEntityType.EVIDENCE]: 'evidence',
  [MediaEntityType.TASK]: 'tasks',
  [MediaEntityType.INVOLVED_PERSON]: 'involved-persons',
  [MediaEntityType.USER]: 'users',
};

const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'audio/mpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly maxFileSize: number;
  private readonly allowedMimeTypes: string[];

  constructor(
    @InjectRepository(Media) private readonly repo: Repository<Media>,
    private readonly s3: S3Service,
    private readonly events: EventPublisherService,
    private readonly config: ConfigService,
  ) {
    this.maxFileSize = parseInt(this.config.get('MAX_FILE_SIZE', '52428800'));
    const configuredMimes = this.config.get<string>('ALLOWED_MIME_TYPES');
    this.allowedMimeTypes = configuredMimes
      ? configuredMimes.split(',').map((m) => m.trim())
      : DEFAULT_ALLOWED_MIME_TYPES;
  }

  async upload(
    file: Express.Multer.File,
    dto: UploadMediaDto,
    uploadedByUserId: string,
  ): Promise<Media> {
    this.validateFile(file);

    const ext = MIME_TO_EXT[file.mimetype] ?? path.extname(file.originalname).slice(1) ?? 'bin';
    const s3Key = `${ENTITY_FOLDER[dto.entity_type]}/${dto.entity_id}/${uuidv4()}.${ext}`;

    this.logger.log(`Uploading ${file.originalname} (${file.size} bytes) → ${s3Key}`);

    const url = await this.s3.upload(s3Key, file.buffer, file.mimetype);

    let record: Media;
    try {
      record = await this.repo.save(
        this.repo.create({
          url,
          entityType: dto.entity_type,
          entityId: dto.entity_id,
          uploadedByUserId,
          originalFilename: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          s3Key,
          deleted: false,
        }),
      );
    } catch (err) {
      // Compensate: remove from S3 if DB save fails
      this.logger.error(`DB save failed after S3 upload — rolling back S3 object: ${s3Key}`);
      await this.s3.delete(s3Key);
      throw err;
    }

    this.events.publishMediaUploaded(uploadedByUserId, record.id, {
      url: record.url,
      entity_type: dto.entity_type,
      entity_id: dto.entity_id,
    });

    this.logger.log(`Media saved: ${record.id} for ${dto.entity_type}/${dto.entity_id}`);
    return record;
  }

  async findByEntity(entityType: MediaEntityType, entityId: string): Promise<Media[]> {
    return this.repo.find({
      where: { entityType, entityId, deleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Media> {
    const record = await this.repo.findOne({ where: { id, deleted: false } });
    if (!record) throw new NotFoundException(`Media ${id} not found`);
    return record;
  }

  async getDownloadUrl(id: string, expiresIn = 3600): Promise<{ url: string; expiresIn: number }> {
    const record = await this.findOne(id);
    const url = await this.s3.getPresignedUrl(record.s3Key, expiresIn);
    return { url, expiresIn };
  }

  async softDelete(id: string): Promise<void> {
    const record = await this.findOne(id);
    record.deleted = true;
    await this.repo.save(record);
    this.logger.log(`Media soft-deleted: ${id}`);
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    if (file.size > this.maxFileSize) {
      const maxMb = Math.round(this.maxFileSize / 1024 / 1024);
      throw new BadRequestException(`File exceeds maximum size of ${maxMb}MB`);
    }
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `MIME type "${file.mimetype}" is not allowed. Allowed: ${this.allowedMimeTypes.join(', ')}`,
      );
    }
  }
}
