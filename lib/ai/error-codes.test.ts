import { describe, it, expect } from 'vitest';
import { ERROR_MAP, detectErrorCode } from '@/lib/ai/error-codes';

describe('ERROR_MAP', () => {
  it('has all 8 error codes', () => {
    const codes = Object.keys(ERROR_MAP);
    expect(codes).toHaveLength(8);
    expect(codes).toContain('EXTERNAL_API_DENIED');
    expect(codes).toContain('EXTERNAL_API_RATE_LIMIT');
    expect(codes).toContain('EXTERNAL_API_TIMEOUT');
    expect(codes).toContain('INSUFFICIENT_DATA');
    expect(codes).toContain('INVALID_SYMBOL');
    expect(codes).toContain('OPTIMIZATION_FAILED');
    expect(codes).toContain('INNGEST_QUEUE_FULL');
    expect(codes).toContain('INTERNAL_ERROR');
  });

  it('every error has userMessage, recoverable, and action', () => {
    for (const [code, def] of Object.entries(ERROR_MAP)) {
      expect(def.userMessage, `${code}: missing userMessage`).toBeDefined();
      expect(typeof def.recoverable, `${code}: recoverable should be boolean`).toBe('boolean');
      expect(def.action, `${code}: missing action`).toBeDefined();
    }
  });

  it('INTERNAL_ERROR is not recoverable', () => {
    expect(ERROR_MAP.INTERNAL_ERROR.recoverable).toBe(false);
  });

  it('timeout and rate limit errors are recoverable', () => {
    expect(ERROR_MAP.EXTERNAL_API_TIMEOUT.recoverable).toBe(true);
    expect(ERROR_MAP.EXTERNAL_API_RATE_LIMIT.recoverable).toBe(true);
  });
});

describe('detectErrorCode', () => {
  it('detects 403 / denied errors', () => {
    const code = detectErrorCode('403 Forbidden: access denied');
    expect(code).toBe('EXTERNAL_API_DENIED');
  });

  it('detects rate limit errors', () => {
    const code = detectErrorCode('429 Too Many Requests: rate limit exceeded');
    expect(code).toBe('EXTERNAL_API_RATE_LIMIT');
  });

  it('detects timeout errors', () => {
    const code = detectErrorCode('TIMEOUT: backtest(AAPL) exceeded 25s limit');
    expect(code).toBe('EXTERNAL_API_TIMEOUT');
  });

  it('detects insufficient data errors', () => {
    const code = detectErrorCode('insufficient data: need at least 50 candles');
    expect(code).toBe('INSUFFICIENT_DATA');
  });

  it('detects invalid symbol errors', () => {
    const code = detectErrorCode('Invalid symbol: XYZABC123');
    expect(code).toBe('INVALID_SYMBOL');
  });

  it('returns INTERNAL_ERROR for unknown messages', () => {
    const code = detectErrorCode('something completely unexpected happened');
    expect(code).toBe('INTERNAL_ERROR');
  });

  it('handles case-insensitive matching', () => {
    expect(detectErrorCode('TIMEOUT: ...')).toBe('EXTERNAL_API_TIMEOUT');
    expect(detectErrorCode('timeout: ...')).toBe('EXTERNAL_API_TIMEOUT');
    expect(detectErrorCode('429 RATE LIMIT...')).toBe('EXTERNAL_API_RATE_LIMIT');
  });
});
