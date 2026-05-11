import { IsString, IsOptional } from 'class-validator';

export class UpdateInvolvedPersonDto {
  @IsOptional()
  @IsString()
  firstNames?: string;

  @IsOptional()
  @IsString()
  lastNames?: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  observations?: string;
}
