import { describe, it, expect } from 'vitest';
import { calculateWinRate } from '@/lib/ta/backtest';
import type { Candle } from '@/lib/ta/backtest';

// Synthetic data: known win/loss pattern
function makeCandles(count: number, trend: 'up' | 'down' | 'flat' = 'up'): Candle[] {
  const candles: Candle[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const open = price;
    if (trend === 'up') price += 1 + Math.random() * 0.5;
    else if (trend === 'down') price -= 1 + Math.random() * 0.5;
    else price = 100 + Math.sin(i * 0.1) * 0.5;
    const close = price;
    candles.push({
      time: (i + 1) as any,
      open: Math.min(open, close),
      high: Math.max(open, close) + 0.1,
      low: Math.min(open, close) - 0.1,
      close,
      volume: 1000,
    });
  }
  return candles;
}

// Perfect RSI-like data: all values at 100 (overbought → SELL signal everywhere)
function makePerfectBuyData(candles: Candle[], value: number) {
  return {
    rsi: candles.map((c) => ({ time: c.time, value })),
    ma: candles.map((c) => ({ time: c.time, value: value - 10 })),
  };
}

describe('calculateWinRate', () => {
  it('returns empty result for insufficient candles', () => {
    const candles = makeCandles(10, 'up');
    const data = makePerfectBuyData(candles, 50);
    const result = calculateWinRate('RSI', candles, data, { lookForward: 5 });
    expect(result.totalSignals).toBe(0);
  });

  it('requires at least 50 candles + lookForward', () => {
    const candles = makeCandles(55, 'up');
    const data = makePerfectBuyData(candles, 50);
    const result = calculateWinRate('RSI', candles, data, { lookForward: 5 });
    // 55 - 50 (minBar) - 5 (lookForward) = 0 signals
    expect(result.totalSignals).toBe(0);
  });

  it('produces signals with sufficient data', () => {
    const candles = makeCandles(200, 'up');
    const data = makePerfectBuyData(candles, 50);
    const result = calculateWinRate('RSI', candles, data, { lookForward: 5 });
    expect(result.totalSignals).toBeGreaterThan(0);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(100);
    expect(result.wins).toBeLessThanOrEqual(result.totalSignals);
  });

  it('returns history array matching totalSignals', () => {
    const candles = makeCandles(200, 'up');
    const data = makePerfectBuyData(candles, 50);
    const result = calculateWinRate('RSI', candles, data, { lookForward: 5 });
    expect(result.history).toHaveLength(result.totalSignals);
  });

  it('winRate is 100 when trend is strictly up and signals are all BUY', () => {
    const candles = makeCandles(200, 'up');
    // RSI backtest: rsi.value > ma.value → BUY
    const data = {
      rsi: candles.map((c) => ({ time: c.time, value: 60 })),
      ma: candles.map((c) => ({ time: c.time, value: 40 })),
    };
    const result = calculateWinRate('RSI', candles, data, { lookForward: 5 });
    // All BUY signals win in an uptrend → 100% win rate
    expect(result.winRate).toBe(100);
  });

  it('winRate is 0 when trend is strictly down and signals are all BUY', () => {
    const candles = makeCandles(200, 'down');
    // RSI backtest: rsi.value > ma.value → BUY
    const data = {
      rsi: candles.map((c) => ({ time: c.time, value: 60 })),
      ma: candles.map((c) => ({ time: c.time, value: 40 })),
    };
    const result = calculateWinRate('RSI', candles, data, { lookForward: 5 });
    // All BUY signals lose in a downtrend → 0% win rate
    expect(result.winRate).toBe(0);
  });

  it('custom lookForward parameter reduces signal count', () => {
    const candles = makeCandles(200, 'up');
    const data = makePerfectBuyData(candles, 25);
    const short = calculateWinRate('RSI', candles, data, { lookForward: 3 });
    const long = calculateWinRate('RSI', candles, data, { lookForward: 10 });
    // Longer lookForward = fewer signals (less bars at the end)
    expect(long.totalSignals).toBeLessThan(short.totalSignals);
  });
});
