import { describe, expect, it } from 'vitest';
import { formatPhone, maskNationalPhone } from './phone';

describe('formatação telefônica', () => {
  it.each([
    ['5511999999999', '(11) 99999-9999'],
    ['551133334444', '(11) 3333-4444'],
    ['11999999999', '(11) 99999-9999'],
    ['1133334444', '(11) 3333-4444']
  ])('formata %s', (input, expected) => expect(formatPhone(input)).toBe(expected));

  it('remove caracteres e limita o telefone nacional', () => {
    expect(maskNationalPhone('11a99999-999988')).toBe('(11) 99999-9999');
  });
});
