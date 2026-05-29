import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthLibModule } from '@aegiscase/auth';
import { KeycloakUsersController } from './keycloak-users.controller';
import { KeycloakUsersService } from './keycloak-users.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { UserDirectoryClient } from './user-directory.client';

@Module({
  imports: [HttpModule, AuthLibModule],
  controllers: [KeycloakUsersController],
  providers: [KeycloakUsersService, KeycloakAdminService, UserDirectoryClient],
})
export class KeycloakModule {}
