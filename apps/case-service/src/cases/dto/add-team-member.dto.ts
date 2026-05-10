import { IsUUID, IsEnum } from 'class-validator';
import { TeamRole } from '@aegiscase/enums';

export class AddTeamMemberDto {
  @IsUUID()
  userId: string;

  @IsEnum(TeamRole)
  teamRole: TeamRole;
}
