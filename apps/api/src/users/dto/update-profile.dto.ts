import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Maria Silva' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Amo moda vintage!' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiPropertyOptional({ example: '11999998888' })
  @IsOptional()
  @IsString()
  phone?: string;

  // Accepts an empty string (remove avatar), a preset identifier
  // (preset:femaleXX), or an https URL returned by POST /uploads/avatar.
  // Reject anything else at the DTO boundary so file:// URIs from unuploaded
  // client images never reach the DB.
  @ApiPropertyOptional({ example: 'https://cdn.vintage.br/avatars/foo.jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @Matches(/^($|preset:[a-zA-Z0-9_-]{1,32}$|https:\/\/\S+$)/, {
    message: 'avatarUrl deve ser vazio, um preset (preset:xxx) ou URL https.',
  })
  avatarUrl?: string;
}
