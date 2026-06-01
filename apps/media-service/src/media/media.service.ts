import {
  BadRequestException,
  ForbiddenException,
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
import { EvidenceCustodyClient } from './evidence-custody.client';
import { MediaEntityType } from '@aegiscase/enums';
import { JwtPayload } from '@aegiscase/common';

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
    private readonly custodyClient: EvidenceCustodyClient,
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
    await this.validateFile(file);

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
          description: dto.description ?? null,
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
      description: record.description ?? undefined,
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

  async getDownloadUrl(
    id: string,
    opts: {
      disposition?: string;
      context?: string;
      actor: JwtPayload;
      authHeader?: string;
    },
    expiresIn = 3600,
  ): Promise<{ url: string; expiresIn: number }> {
    const record = await this.findOne(id);

    // Fail-safe normalization: only an explicit `inline` is treated as a preview;
    // anything else (incl. unknown values) is a download → goes through custody gating.
    const disposition: 'inline' | 'attachment' =
      opts.disposition === 'inline' ? 'inline' : 'attachment';

    if (record.entityType === MediaEntityType.EVIDENCE) {
      if (disposition === 'attachment') {
        // Cambio 2 — enforcement: only the current custodian may DOWNLOAD evidence files.
        const custodianId = await this.custodyClient.getCurrentCustodianId(
          record.entityId,
          opts.authHeader,
        );
        if (custodianId !== opts.actor.sub) {
          throw new ForbiddenException(
            'You must hold custody of this evidence to download its files',
          );
        }
      } else if (opts.context === 'viewer') {
        // Cambio 3 — traceability for a deliberate inline VIEW (not a thumbnail).
        // Only logged when the FE explicitly tags the request `context=viewer`, so
        // gallery thumbnails (no context) never generate audit noise.
        this.events.publishEvidenceMediaViewed(opts.actor.sub, record.id, {
          evidence_id: record.entityId,
          media_id: record.id,
        });
      }
    }

    const url = await this.s3.getPresignedUrl(record.s3Key, expiresIn, {
      disposition,
      filename: record.originalFilename ?? undefined,
    });
    return { url, expiresIn };
  }

  async softDelete(id: string): Promise<void> {
    const record = await this.findOne(id);
    record.deleted = true;
    await this.repo.save(record);
    this.logger.log(`Media soft-deleted: ${id}`);
  }

  private async validateFile(file: Express.Multer.File): Promise<void> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.size > this.maxFileSize) {
      const maxMb = Math.round(this.maxFileSize / 1024 / 1024);
      throw new BadRequestException(`File exceeds maximum size of ${maxMb}MB`);
    }

    // Detect actual file type from magic bytes — ignores client-declared MIME type
    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(file.buffer);

    if (detected) {
      // Binary file with identifiable magic bytes: must match declared type AND be in allowlist
      if (detected.mime !== file.mimetype) {
        throw new BadRequestException(
          `File content (${detected.mime}) does not match declared type (${file.mimetype})`,
        );
      }
      if (!this.allowedMimeTypes.includes(detected.mime)) {
        throw new BadRequestException(`File type "${detected.mime}" is not allowed`);
      }
    } else {
      // No magic bytes detected — file is likely plain text
      // Only allow if declared MIME is text/plain
      if (file.mimetype !== 'text/plain') {
        throw new BadRequestException(
          `Cannot verify file type. Declare content as text/plain or use a supported binary format`,
        );
      }
    }
  }
}
