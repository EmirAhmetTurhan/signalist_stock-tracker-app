// Stochastic RSI indicator utilities
// StochRSI = (RSI - minRSI) / (maxRSI - minRSI)
// Then smoothed with SMA

import { createSMA } from './_math';
import { computeRSI } from './rsi';

export type StochRsiInput = {
  time: number;
  close: number;
};

export type StochRsiOutput = {
  time: number;
  k?: number;
  d?: number;
};

export function computeStochRSI(
  candles: StochRsiInput[],
  rsiLength = 14,
  stochLength = 14,
  kSmoothing = 3,
  dSmoothing = 3
): StochRsiOutput[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];

  // Paylaşılan computeRSI fonksiyonunu kullan (artık yerel implementasyon yok)
  const rsiResult = computeRSI(candles, rsiLength, 1);
  const rsiValues = rsiResult.map(r => r.rsi);

  const kValues: (number | undefined)[] = new Array(candles.length).fill(undefined);

  for (let i = 0; i < candles.length; i++) {
    const rsi = rsiValues[i];
    if (typeof rsi !== 'number') continue;

    const start = i - stochLength + 1;
    if (start < 0) continue;

    let minRsi = Infinity;
    let maxRsi = -Infinity;

    for (let j = start; j <= i; j++) {
      const v = rsiValues[j];
      if (typeof v === 'number') {
        if (v < minRsi) minRsi = v;
        if (v > maxRsi) maxRsi = v;
      }
    }

    if (maxRsi - minRsi === 0) {
      kValues[i] = 0; // TradingView-compatible: stoch() returns 0 when highest==lowest
    } else {
      kValues[i] = ((rsi - minRsi) / (maxRsi - minRsi)) * 100;
    }
  }

  // K smoothing
  const kSmooth = createSMA(kValues, kSmoothing);
  // D line = SMA of K
  const dLine = createSMA(kSmooth, dSmoothing);

  return candles.map((c, i) => ({
    time: c.time,
    k: kSmooth[i],
    d: dLine[i],
  }));
}
