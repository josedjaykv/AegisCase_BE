import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateInvolvedPersonDto {
  @IsString()
  @IsNotEmpty()
  firstNames: string;

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
