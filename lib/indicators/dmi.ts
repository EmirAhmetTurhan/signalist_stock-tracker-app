// Directional Movement Index (DMI) utilities
// Default period: 14

export type DMIInput = {
  time: UTCTimestamp;
  high: number;
  low: number;
  close: number;
};

export type DMIPoint = {
  time: UTCTimestamp;
  plusDI?: number; // +DI
  minusDI?: number; // -DI
  adx?: number; // Average Directional Index
};

function wildersSmooth(values: number[], period: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(values.length).fill(undefined);
  if (period <= 0 || values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i] ?? 0;
  let prev = sum;
  out[period - 1] = prev;

  for (let i = period; i < values.length; i++) {
    const cur = values[i] ?? 0;
    prev = prev - prev / period + cur;
    out[i] = prev;
  }
  return out;
}

export function computeDMI(
    candles: DMIInput[],
    diLength = 14,      // DI Length
    adxSmoothing = 14   // ADX Smoothing
): DMIPoint[] {
    if (!Array.isArray(candles) || candles.length === 0) return [];

    const highs = candles.map((c) => Number(c.high ?? 0));
    const lows = candles.map((c) => Number(c.low ?? 0));
    const closes = candles.map((c) => Number(c.close ?? 0));

    const len = candles.length;
    const trArr: number[] = new Array(len).fill(0);
    const plusDMArr: number[] = new Array(len).fill(0);
    const minusDMArr: number[] = new Array(len).fill(0);

    for (let i = 1; i < len; i++) {
        const high = highs[i];
        const low = lows[i];
        const prevClose = closes[i - 1];
        const prevHigh = highs[i - 1];
        const prevLow = lows[i - 1];

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trArr[i] = tr;

        const upMove = high - prevHigh;
        const downMove = prevLow - low;
        plusDMArr[i] = upMove > 0 && upMove > downMove ? upMove : 0;
        minusDMArr[i] = downMove > 0 && downMove > upMove ? downMove : 0;
    }

    const trSmooth = wildersSmooth(trArr, diLength);
    const plusDMSmooth = wildersSmooth(plusDMArr, diLength);
    const minusDMSmooth = wildersSmooth(minusDMArr, diLength);

    const plusDI: (number | undefined)[] = new Array(len).fill(undefined);
    const minusDI: (number | undefined)[] = new Array(len).fill(undefined);
    for (let i = 0; i < len; i++) {
        const trS = trSmooth[i];
        const p = plusDMSmooth[i];
        const m = minusDMSmooth[i];
        if (typeof trS === 'number' && trS > 0 && typeof p === 'number' && typeof m === 'number') {
            plusDI[i] = (p / trS) * 100;
            minusDI[i] = (m / trS) * 100;
        }
    }

    const dxArr: number[] = new Array(len).fill(0);
    for (let i = 0; i < len; i++) {
        const p = plusDI[i];
        const m = minusDI[i];
        if (typeof p === 'number' && typeof m === 'number' && p + m !== 0) {
            dxArr[i] = (Math.abs(p - m) / (p + m)) * 100;
        } else {
            dxArr[i] = 0;
        }
    }

    const adxSmooth = wildersSmooth(dxArr, adxSmoothing);
    const adx: (number | undefined)[] = new Array(len).fill(undefined);
    for (let i = 0; i < len; i++) {
        const v = adxSmooth[i];
        if (typeof v === 'number') adx[i] = v / adxSmoothing;
    }

    const out: DMIPoint[] = candles.map((c, i) => ({
        time: c.time,
        plusDI: plusDI[i],
        minusDI: minusDI[i],
        adx: adx[i],
    }));

    return out;
}
