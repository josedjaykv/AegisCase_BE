import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { Media } from './media.entity';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { S3Service } from './s3.service';
import { EvidenceCustodyClient } from './evidence-custody.client';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([Media]), HttpModule, EventsModule],
  controllers: [MediaController],
  providers: [MediaService, S3Service, EvidenceCustodyClient],
})
export class MediaModule {}
