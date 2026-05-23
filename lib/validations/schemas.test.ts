import { describe, it, expect } from 'vitest';
import { signInSchema, signUpSchema, stockSymbolSchema, createAlertSchema, validate } from '@/lib/validations/schemas';

describe('stockSymbolSchema', () => {
  it('accepts valid symbols', () => {
    expect(stockSymbolSchema.parse('AAPL')).toBe('AAPL');
    expect(stockSymbolSchema.parse('msft')).toBe('MSFT'); // auto-uppercase
    expect(stockSymbolSchema.parse('BRK.B')).toBe('BRK.B');
  });

  it('rejects empty string', () => {
    expect(() => stockSymbolSchema.parse('')).toThrow();
  });

  it('rejects symbols longer than 10 chars', () => {
    expect(() => stockSymbolSchema.parse('VERYLONGSYMBOL')).toThrow();
  });

  it('trims whitespace', () => {
    expect(stockSymbolSchema.parse('  AAPL  ')).toBe('AAPL');
  });

  it('rejects symbols with special characters', () => {
    expect(() => stockSymbolSchema.parse('AAPL!')).toThrow();
    expect(() => stockSymbolSchema.parse('A@PL')).toThrow();
  });
});

describe('signInSchema', () => {
  it('accepts valid email and password', () => {
    const result = signInSchema.safeParse({ email: 'test@test.com', password: '12345678' });
    expect(result.success).toBe(true);
  });

  it('rejects short password', () => {
    const result = signInSchema.safeParse({ email: 'test@test.com', password: '123' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = signInSchema.safeParse({ email: 'not-email', password: '12345678' });
    expect(result.success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('accepts valid signup data', () => {
    const result = signUpSchema.safeParse({
      fullName: 'Test User',
      email: 'test@test.com',
      password: '12345678',
      country: 'TR',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const result = signUpSchema.safeParse({
      email: 'test@test.com',
      password: '12345678',
    });
    expect(result.success).toBe(false);
  });
});

describe('createAlertSchema', () => {
  it('accepts valid alert data', () => {
    const result = createAlertSchema.safeParse({
      symbol: 'AAPL',
      company: 'Apple Inc',
      alertName: 'Apple Alert',
      alertType: 'upper',
      threshold: 200,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative threshold', () => {
    const result = createAlertSchema.safeParse({
      symbol: 'AAPL',
      company: 'Apple',
      alertName: 'Test',
      alertType: 'upper',
      threshold: -5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid alert type', () => {
    const result = createAlertSchema.safeParse({
      symbol: 'AAPL',
      company: 'Apple',
      alertName: 'Test',
      alertType: 'middle',
      threshold: 100,
    });
    expect(result.success).toBe(false);
  });
});

describe('validate()', () => {
  it('returns success with data on valid input', () => {
    const result = validate(stockSymbolSchema, 'AAPL');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('AAPL');
  });

  it('returns error message on invalid input', () => {
    const result = validate(stockSymbolSchema, '');
    expect(result.success).toBe(false);
    if (!result.success) expect(typeof result.error).toBe('string');
  });
});
