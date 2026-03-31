import { IsBoolean, IsEmail, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreatePartnerDto {
  @IsString()
  @MaxLength(128)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsBoolean()
  canReceiveData?: boolean;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  webhookUrl?: string;
}
