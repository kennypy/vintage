import { SmsService } from './sms.service';

describe('SmsService.maskCodes', () => {
  it('masks a 6-digit 2FA code down to its last 2 digits', () => {
    expect(SmsService.maskCodes('123456')).toBe('****56');
  });

  it('masks the code embedded in a full SMS body', () => {
    expect(SmsService.maskCodes('Seu código Vintage é 482913. Válido por 5 min.')).toBe(
      'Seu código Vintage é ****13. Válido por 5 min.',
    );
  });

  it('leaves short digit runs (< 3) untouched', () => {
    expect(SmsService.maskCodes('em 5 min, sala 12')).toBe('em 5 min, sala 12');
  });

  it('masks every digit run independently', () => {
    expect(SmsService.maskCodes('999 e 123456')).toBe('*99 e ****56');
  });

  it('never leaves more than the last 2 digits of any run visible', () => {
    const masked = SmsService.maskCodes('000000');
    expect(masked).toBe('****00');
    // Only the final two characters are digits.
    expect(masked.replace(/\*/g, '')).toHaveLength(2);
  });
});
