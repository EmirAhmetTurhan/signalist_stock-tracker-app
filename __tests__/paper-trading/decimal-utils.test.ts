import { describe, it, expect } from 'vitest';
import { decimalAdd, decimalSub, decimalMul, decimalDiv, weightedAvgPrice, toDecimal128, fromDecimal128 } from '@/lib/paper-trading/decimal-utils';

describe('Decimal Utilities', () => {
  it('solves 0.1 + 0.2 floating point issue', () => {
    // Standard JS gives 0.30000000000000004
    expect(0.1 + 0.2).not.toBe(0.3);
    
    // Our decimal util should give exactly 0.3
    expect(decimalAdd(0.1, 0.2)).toBe(0.3);
  });

  it('decimalSub handles precision correctly', () => {
    expect(decimalSub(0.3, 0.2)).toBe(0.1);
    expect(decimalSub(100, 33.33)).toBe(66.67);
  });

  it('decimalMul handles precision correctly', () => {
    expect(decimalMul(0.1, 0.2)).toBe(0.02);
  });

  it('decimalDiv handles precision correctly', () => {
    expect(decimalDiv(0.3, 3)).toBe(0.1);
  });

  it('weightedAvgPrice calculates correctly', () => {
    // 10 shares @ 100, then 10 shares @ 200 => avg 150
    expect(weightedAvgPrice(10, 100, 10, 200)).toBe(150);
    
    // 5 shares @ 10, then 15 shares @ 20 => (50 + 300) / 20 = 17.5
    expect(weightedAvgPrice(5, 10, 15, 20)).toBe(17.5);
  });

  it('converts number to Decimal128 and back', () => {
    const val = 123.45;
    const dec = toDecimal128(val);
    expect(dec.toString()).toBe('123.45');
    const back = fromDecimal128(dec);
    expect(back).toBe(123.45);
  });
});
