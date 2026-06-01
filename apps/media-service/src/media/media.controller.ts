import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { Roles } from '@aegiscase/auth';
import { CurrentUser, JwtPayload } from '@aegiscase/common';
import { UserRole, MediaEntityType } from '@aegiscase/enums';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '@aegiscase/dto';

class MediaByEntityQuery extends PaginationDto {
  @IsOptional()
  @IsEnum(MediaEntityType)
  entity_type?: MediaEntityType;
}

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 }, // 100MB hard cap at multer level
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload media file to S3 and associate with entity' })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.mediaService.upload(file, dto, user.sub);
  }

  @Get('entity/:entityType/:entityId')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'List media for a given entity' })
  findByEntity(
    @Param('entityType') entityType: MediaEntityType,
    @Param('entityId') entityId: string,
    @Query() query: MediaByEntityQuery,
  ) {
    return this.mediaService.findByEntity(entityType, entityId);
  }

  @Get(':id/download-url')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({
    summary:
      'Generate a pre-signed URL. For EVIDENCE media, disposition=attachment requires custody (403 otherwise).',
  })
  getDownloadUrl(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Headers('authorization') authHeader: string,
    @Query('disposition') disposition?: string,
    @Query('context') context?: string,
  ) {
    return this.mediaService.getDownloadUrl(id, {
      disposition,
      context,
      actor: user,
      authHeader,
    });
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  @ApiOperation({ summary: 'Get media metadata by ID' })
  findOne(@Param('id') id: string) {
    return this.mediaService.findOne(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete media (ADMIN only)' })
  async softDelete(@Param('id') id: string) {
    await this.mediaService.softDelete(id);
  }
}
