import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
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
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.mediaService.upload(file, dto, user.sub);
  }

  @Get('entity/:entityType/:entityId')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  findByEntity(
    @Param('entityType') entityType: MediaEntityType,
    @Param('entityId') entityId: string,
    @Query() query: MediaByEntityQuery,
  ) {
    return this.mediaService.findByEntity(entityType, entityId);
  }

  @Get(':id/download-url')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  getDownloadUrl(@Param('id') id: string) {
    return this.mediaService.getDownloadUrl(id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DETECTIVE, UserRole.ANALYST)
  findOne(@Param('id') id: string) {
    return this.mediaService.findOne(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDelete(@Param('id') id: string) {
    await this.mediaService.softDelete(id);
  }
}
