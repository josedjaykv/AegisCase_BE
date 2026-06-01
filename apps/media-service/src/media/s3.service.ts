import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.region = config.get('AWS_REGION', 'us-east-1');
    this.bucket = config.get('AWS_S3_BUCKET', 'aegiscase-media');

    this.client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: config.get('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: config.get('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  async upload(s3Key: string, buffer: Buffer, mimeType: string): Promise<string> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: mimeType,
          ServerSideEncryption: 'AES256',
        }),
      );
      this.logger.log(`Uploaded to S3: ${s3Key}`);
      return this.buildUrl(s3Key);
    } catch (err) {
      this.logger.error(`S3 upload failed for ${s3Key}: ${err?.message}`, err?.stack);
      throw new ServiceUnavailableException('File storage service is unavailable');
    }
  }

  async getPresignedUrl(
    s3Key: string,
    expiresIn = 3600,
    opts: { disposition?: 'inline' | 'attachment'; filename?: string } = {},
  ): Promise<string> {
    try {
      const responseContentDisposition = opts.disposition
        ? this.buildContentDisposition(opts.disposition, opts.filename)
        : undefined;
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          ResponseContentDisposition: responseContentDisposition,
        }),
        { expiresIn },
      );
    } catch (err) {
      this.logger.error(`Failed to generate presigned URL for ${s3Key}: ${err?.message}`);
      throw new ServiceUnavailableException('Failed to generate download URL');
    }
  }

  private buildContentDisposition(
    disposition: 'inline' | 'attachment',
    filename?: string,
  ): string {
    if (!filename) return disposition;
    // RFC 5987 — encode the filename so non-ASCII names (e.g. accents) survive.
    const encoded = encodeURIComponent(filename);
    return `${disposition}; filename*=UTF-8''${encoded}`;
  }

  async delete(s3Key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }));
      this.logger.log(`Deleted from S3: ${s3Key}`);
    } catch (err) {
      this.logger.error(`S3 delete failed for ${s3Key}: ${err?.message}`);
    }
  }

  private buildUrl(s3Key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${s3Key}`;
  }
}
