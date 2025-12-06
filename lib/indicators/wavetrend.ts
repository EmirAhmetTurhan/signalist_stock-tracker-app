export type WTInput = {
  time: UTCTimestamp;
  high: number;
  low: number;
  close: number;
};

export type WTPoint = {
  time: UTCTimestamp;
  wt1?: number;
  wt2?: number;
  cross?: 1 | -1; // 1: bullish cross (wt1 crosses above wt2), -1: bearish cross
};

function ema(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  if (values.length < period) return out;
  const k = 2 / (period + 1);

  // seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i] ?? 0;
  let prev = sum / period;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    const v = values[i] ?? 0;
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function sma(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  if (period <= 0 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function computeWaveTrend(
  candles: WTInput[],
  n1 = 10,
  n2 = 21,
  signal = 4
): WTPoint[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];

  const hlc3 = candles.map((c) => (Number(c.high ?? 0) + Number(c.low ?? 0) + Number(c.close ?? 0)) / 3);

  // ESA and DE per LazyBear
  const esa = ema(hlc3, n1);
  const deInput: number[] = hlc3.map((v, i) => Math.abs(v - (typeof esa[i] === 'number' ? (esa[i] as number) : v)));
  const de = ema(deInput, n1);

  const ci: number[] = hlc3.map((v, i) => {
    const e = esa[i];
    const d = de[i];
    const denom = 0.015 * (typeof d === 'number' ? d : 0);
    if (typeof e !== 'number' || denom === 0) return 0;
    return (v - e) / (denom || 1e-12);
  });

  const wt1Arr = ema(ci, n2); // TCI
  const wt2Arr = sma(ci.map((_, i) => (typeof wt1Arr[i] === 'number' ? (wt1Arr[i] as number) : 0)), signal);

  const out: WTPoint[] = candles.map((c, i) => ({
    time: c.time,
    wt1: wt1Arr[i],
    wt2: wt2Arr[i],
  }));

  // Detect crosses
  for (let i = 1; i < out.length; i++) {
    const p1 = out[i - 1];
    const p2 = out[i];
    const a1 = p1.wt1;
    const b1 = p1.wt2;
    const a2 = p2.wt1;
    const b2 = p2.wt2;
    if (typeof a1 === 'number' && typeof b1 === 'number' && typeof a2 === 'number' && typeof b2 === 'number') {
      // bullish cross when wt1 crosses above wt2
      if (a1 <= b1 && a2 > b2) p2.cross = 1;
      // bearish cross when wt1 crosses below wt2
      else if (a1 >= b1 && a2 < b2) p2.cross = -1;
    }
  }

  return out;
}
