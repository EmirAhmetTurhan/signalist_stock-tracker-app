// Money Flow Index (MFI) utilities
// Default period: 14
// Pine Script reference: ta.rma() (Wilder smoothing) for pos/neg money flow

import { createSMMA } from './_math';

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

  // Positive / negative money flow (with sign)
  // Pine Script: mf_sign = tp > tp[1] ? tp * volume : tp[1] > tp ? -tp * volume : 0
  // NOT: tp[i] == tp[i-1] olduğunda Pine Script 0 döndürür (hem pos hem neg 0).
  //   Önceki kod: `tp[i] > tp[i-1] ? rmf[i] : -rmf[i]` → eşitlikte -rmf (hatalı)
  const posMF: number[] = new Array(len).fill(0);
  const negMF: number[] = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const sign = tp[i] > tp[i - 1] ? rmf[i] : tp[i] < tp[i - 1] ? -rmf[i] : 0;
    if (sign > 0) posMF[i] = sign;
    else if (sign < 0) negMF[i] = -sign;
  }

  // Wilder smoothing (RMA) — matches ta.rma() in Pine Script
  const rmaPos = createSMMA(posMF, period);
  const rmaNeg = createSMMA(negMF, period);

  const out: MFIPoint[] = candles.map((c, i) => {
    const pos = rmaPos[i];
    const neg = rmaNeg[i];
    if (typeof pos !== 'number' || typeof neg !== 'number') {
      return { time: c.time, mfi: undefined };
    }
    if (neg === 0) return { time: c.time, mfi: 100 };
    // Pine Script: 100 - (100 / (1 + mfi_pos / (mfi_neg + 1e-10)))
    const mfr = pos / (neg + 1e-10);
    const mfi = 100 - 100 / (1 + mfr);
    return { time: c.time, mfi };
  });

  return out;
}
