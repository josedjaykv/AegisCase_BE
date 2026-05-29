import { IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TeamRole } from '@aegiscase/enums';

/**
 * Body for PATCH /cases/:id/team/:userId.
 *
 * Only the role is mutable; the (caseId, userId) PK is taken from the path.
 * The two CREATOR-related rejections are enforced in the service (not here)
 * so the error messages are exact and tested.
 */
export class UpdateTeamMemberDto {
  @ApiProperty({ enum: TeamRole, description: 'New role for the team member' })
  @IsNotEmpty({ message: 'teamRole is required' })
  @IsEnum(TeamRole, { message: 'teamRole must be a valid role' })
  teamRole: TeamRole;
}
