import { IsBoolean, IsEnum } from 'class-validator';
import { ConsentType } from '@prisma/client';

export class UpdateConsentDto {
  @IsEnum(ConsentType)
  consentType!: ConsentType;

  @IsBoolean()
  granted!: boolean;
}
