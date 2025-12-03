// Stochastic RSI indicator utilities
// Default params: rsiLength=14, stochLength=14, k=3, d=3

export type StochRsiInput = {
  time: UTCTimestamp;
  close: number;
};

export type StochRsiOutput = {
  time: UTCTimestamp;
  k?: number; // %K
  d?: number; // %D
};

function sma(values: (number | undefined)[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  const q: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number') {
      q.push(v);
      sum += v;
    } else {
      // keep window aligned; push NaN to keep length
      q.push(NaN);
    }
    if (q.length > period) {
      const removed = q.shift();
      if (removed !== undefined && !Number.isNaN(removed)) sum -= removed;
    }
    if (q.length === period) {
      const valid = q.filter((x) => !Number.isNaN(x));
      if (valid.length === period) out[i] = sum / period;
    }
  }
  return out;
}

// Wilder's RSI
function rsi(values: number[], length: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  if (values.length < length + 1) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= length; i++) {
    const change = values[i] - values[i - 1];
    if (change >= 0) gainSum += change; else lossSum -= change;
  }
  let avgGain = gainSum / length;
  let avgLoss = lossSum / length;
  const firstIndex = length;
  out[firstIndex] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = firstIndex + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

export function computeStochRSI(
  candles: StochRsiInput[],
  rsiLength = 14,
  stochLength = 14,
  kSmoothing = 3,
  dSmoothing = 3
): StochRsiOutput[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const closes = candles.map((c) => Number(c.close ?? 0));

  const rsiSeries = rsi(closes, rsiLength);

  // Stochastic of RSI: (RSI - min(RSI, L)) / (max(RSI, L) - min(...)) * 100
  const stochRsiRaw: (number | undefined)[] = new Array(candles.length).fill(undefined);
  let window: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = rsiSeries[i];
    // maintain window of last stochLength RSI values (defined only)
    if (typeof v === 'number') {
      window.push(v);
    } else {
      window.push(NaN);
    }
    if (window.length > stochLength) window.shift();
    const valid = window.filter((x) => !Number.isNaN(x));
    if (valid.length === stochLength) {
      const min = Math.min(...valid);
      const max = Math.max(...valid);
      if (max !== min) stochRsiRaw[i] = ((v as number) - min) / (max - min) * 100;
      else stochRsiRaw[i] = 0; // flat
    }
  }

  const kSeries = sma(stochRsiRaw, kSmoothing);
  const dSeries = sma(kSeries, dSmoothing);

  const out: StochRsiOutput[] = candles.map((c, i) => ({
    time: c.time,
    k: kSeries[i],
    d: dSeries[i],
  }));

  return out;
}
