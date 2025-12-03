// Money Flow Index (MFI) utilities
// Default period: 14

export type MFIInput = {
  time: UTCTimestamp;
  high: number;
  low: number;
  close: number;
  volume?: number; // optional volume; treated as 0 if missing
};

export type MFIPoint = {
  time: UTCTimestamp;
  mfi?: number; // 0..100
};

export function computeMFI(candles: MFIInput[], period = 14): MFIPoint[] {
  if (!Array.isArray(candles) || candles.length === 0) return [];

  const len = candles.length;
  const tp: number[] = new Array(len).fill(0); // typical price
  const rmf: number[] = new Array(len).fill(0); // raw money flow (tp * volume)

  for (let i = 0; i < len; i++) {
    const h = Number(candles[i].high ?? 0);
    const l = Number(candles[i].low ?? 0);
    const c = Number(candles[i].close ?? 0);
    const v = Number(candles[i].volume ?? 0);
    const t = (h + l + c) / 3;
    tp[i] = t;
    rmf[i] = t * Math.max(v, 0);
  }

  const posMF: number[] = new Array(len).fill(0);
  const negMF: number[] = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    if (tp[i] > tp[i - 1]) posMF[i] = rmf[i];
    else if (tp[i] < tp[i - 1]) negMF[i] = rmf[i];
    // if equal, both 0
  }

  // rolling sums over period
  const sumPos: number[] = new Array(len).fill(0);
  const sumNeg: number[] = new Array(len).fill(0);
  let accPos = 0;
  let accNeg = 0;
  for (let i = 0; i < len; i++) {
    accPos += posMF[i];
    accNeg += negMF[i];
    if (i >= period) {
      accPos -= posMF[i - period];
      accNeg -= negMF[i - period];
    }
    sumPos[i] = i >= period ? accPos : 0;
    sumNeg[i] = i >= period ? accNeg : 0;
  }

  const out: MFIPoint[] = candles.map((c, i) => {
    if (i < period) return { time: c.time, mfi: undefined };
    const pos = sumPos[i];
    const neg = sumNeg[i];
    if (neg === 0) return { time: c.time, mfi: 100 };
    const mfr = pos / (neg || 1e-12);
    const mfi = 100 - 100 / (1 + mfr);
    return { time: c.time, mfi };
  });

  return out;
}
