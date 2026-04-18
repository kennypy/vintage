import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CPF_REGEX } from '@vintage/shared';

/**
 * One-shot CPF addition for OAuth accounts that were created without a CPF.
 * CPF can NOT be changed after it's set — a change would invalidate every
 * payout/NF-e record tied to the account. Corrections go through support.
 */
export class SetCpfDto {
  @ApiProperty({
    description: 'CPF no formato 000.000.000-00 ou 11 dígitos sem separadores.',
    example: '529.982.247-25',
  })
  @IsString()
  // Accept both the canonical 000.000.000-00 form AND plain 11-digit input.
  // The server always stores digits only.
  @Matches(CPF_REGEX, { message: 'Formato de CPF inválido.' })
  cpf!: string;
}
