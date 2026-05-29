import { IsUUID, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TeamRole } from '@aegiscase/enums';

export class AddTeamMemberDto {
  @ApiProperty({ description: 'User to add to case team (UUID)' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: TeamRole })
  @IsEnum(TeamRole)
  teamRole: TeamRole;
}
