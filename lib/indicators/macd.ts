// MACD indicator utilities
// Computes MACD line (fastEMA - slowEMA), Signal line (EMA of MACD), and Histogram (MACD - Signal)

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

// TradingView's ta.ema seeds the EMA with the first value instead of an SMA warm-up.
// Using that approach here ensures MACD values match TradingView more closely.
function ema(values: number[], period: number): (number | undefined)[] {
  const n = values.length;
  const out: (number | undefined)[] = new Array(n).fill(undefined);
  if (n === 0) return out;

  const k = 2 / (period + 1);
  let prev = Number(values[0] ?? 0);
  out[0] = prev;
  for (let i = 1; i < n; i++) {
    const v = Number(values[i] ?? 0);
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function computeMACD(
  candles: MACDInput[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MACDOutput[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const closes = candles.map((c) => Number(c.close ?? 0));

  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);

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

  const signalDefined = ema(macdDefinedValues, signalPeriod);

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
