import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard, RolesGuard, Roles } from '@aegiscase/auth';
import { UserRole } from '@aegiscase/enums';
import { KeycloakUsersService } from './keycloak-users.service';
import { KeycloakUsersQueryDto } from './dto/keycloak-users-query.dto';
import { KeycloakUsersPageDto } from './dto/keycloak-user.dto';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class KeycloakUsersController {
  constructor(private readonly service: KeycloakUsersService) {}

  @Get('keycloak-users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Search Keycloak users and their AegisCase provisioning status (ADMIN)',
  })
  @ApiResponse({ status: 200, type: KeycloakUsersPageDto })
  @ApiResponse({ status: 400, description: 'search missing or shorter than 2 characters' })
  @ApiResponse({ status: 403, description: 'caller is not ADMIN' })
  @ApiResponse({ status: 503, description: 'Keycloak admin API unreachable' })
  search(
    @Query() query: KeycloakUsersQueryDto,
    @Req() req: Request,
  ): Promise<KeycloakUsersPageDto> {
    return this.service.search(query, req.headers['authorization']);
  }
}
