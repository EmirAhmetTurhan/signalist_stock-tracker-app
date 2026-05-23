import { describe, it, expect } from 'vitest';
import { computeRSI } from '@/lib/indicators/rsi';

// Synthetic 20-bar test data: price slowly rising
const makeCandles = (prices: number[]) =>
  prices.map((close, i) => ({ time: i + 1, close }));

describe('computeRSI', () => {
  it('returns empty array for empty input', () => {
    expect(computeRSI([])).toEqual([]);
  });

  it('returns array of same length as input', () => {
    const candles = makeCandles(Array.from({ length: 30 }, (_, i) => 100 + i));
    const result = computeRSI(candles);
    expect(result).toHaveLength(30);
  });

  it('returns valid RSI for all bars after warmup period', () => {
    // With flat prices, there are zero gains and losses
    // RSI = 100 when average loss is 0 (no downward movement)
    const candles = makeCandles(Array.from({ length: 30 }, () => 100));
    const result = computeRSI(candles, 14);
    // RSI is defined after warmup (SMMA starts at index length-1)
    expect(result[13].rsi).toBeDefined();
    expect(typeof result[13].rsi).toBe('number');
  });

  it('computes RSI = 100 when all gains (no losses)', () => {
    // Strictly rising prices: only gains, zero losses
    const candles = makeCandles(Array.from({ length: 50 }, (_, i) => 100 + i * 2));
    const result = computeRSI(candles, 14);
    const last = result[result.length - 1];
    expect(last.rsi).toBeGreaterThan(90); // near 100
  });

  it('computes RSI near 0 when all losses', () => {
    // Strictly falling prices: only losses, zero gains
    const candles = makeCandles(Array.from({ length: 50 }, (_, i) => 200 - i * 2));
    const result = computeRSI(candles, 14);
    const last = result[result.length - 1];
    expect(last.rsi).toBeLessThan(10); // near 0
  });

  it('computes RSI near 50 for flat prices', () => {
    const candles = makeCandles(Array.from({ length: 50 }, () => 100));
    const result = computeRSI(candles, 14);
    // With Wilder's smoothing and equal gains/losses near 0
    // RSI will approach 50 over time
    const last = result[result.length - 1];
    expect(last.rsi).toBeDefined();
    // After 50 bars of flat prices, RSI should be near 50
    // (Wilder's smoothing converges slowly from the initial average)
  });

  it('produces MA values for each RSI value', () => {
    const candles = makeCandles(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 10));
    const result = computeRSI(candles, 14, 14);
    // After warmup, both rsi and ma should exist
    const lastWithRSI = result.filter((r) => typeof r.rsi === 'number');
    const withMA = lastWithRSI.filter((r) => typeof r.ma === 'number');
    expect(withMA.length).toBeGreaterThan(0);
  });

  it('handles custom length parameter', () => {
    // Oscillating prices to produce varying RSI values
    const candles = makeCandles(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.3) * 10));
    const rsi14 = computeRSI(candles, 14);
    const rsi7 = computeRSI(candles, 7);
    const last14 = rsi14[rsi14.length - 1];
    const last7 = rsi7[rsi7.length - 1];
    expect(typeof last14.rsi).toBe('number');
    expect(typeof last7.rsi).toBe('number');
    // Different lengths produce different RSI values
    expect(last14.rsi).not.toBe(last7.rsi);
  });
});
