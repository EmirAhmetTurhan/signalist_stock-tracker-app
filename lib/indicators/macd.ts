// MACD indicator utilities
// Computes MACD line (fastEMA - slowEMA), Signal line (EMA of MACD), and Histogram (MACD - Signal)

import { createEMA } from './_math';

export type MACDInput = {
  time: UTCTimestamp;
  close: number;
};

export type MACDOutput = {
  time: UTCTimestamp;
  macd?: number;
  signal?: number;
  histogram?: number;
};

export function computeMACD(
  candles: MACDInput[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MACDOutput[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  // Guard: fast must be < slow for correct MACD semantics
  if (fast >= slow) fast = slow - 1;
  const closes = candles.map((c) => Number(c.close ?? 0));

  // MACD, TradingView uyumu için 'value' seed kullanır (ilk değerle başlatma)
  const emaFast = createEMA(closes, fast, 'value');
  const emaSlow = createEMA(closes, slow, 'value');

  const macdLine: (number | undefined)[] = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (typeof f === 'number' && typeof s === 'number') return f - s;
    return undefined;
  });

  // Build a series for Signal EMA using only defined MACD values
  const macdDefinedValues: number[] = [];
  const macdDefinedIndexMap: number[] = [];
  macdLine.forEach((v, i) => {
    if (typeof v === 'number') {
      macdDefinedValues.push(v);
      macdDefinedIndexMap.push(i);
    }
  });

  // Signal hattı için de 'value' seed kullan (MACD signal line TradingView uyumu)
  const signalDefined = createEMA(macdDefinedValues, signalPeriod, 'value');

  const signalSeries: (number | undefined)[] = new Array(candles.length).fill(undefined);
  signalDefined.forEach((v, j) => {
    const originalIdx = macdDefinedIndexMap[j];
    signalSeries[originalIdx] = v;
  });

  const out: MACDOutput[] = candles.map((c, i) => {
    const macd = macdLine[i];
    const signal = signalSeries[i];
    const histogram =
      typeof macd === 'number' && typeof signal === 'number' ? macd - signal : undefined;
    return { time: c.time, macd, signal, histogram };
  });

  return out;
}
