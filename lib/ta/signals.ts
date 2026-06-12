// lib/ta/signals.ts — İndikatör sinyal üretimi ve genel skor hesaplama
// Hem TA sayfası hem de AI Agent tarafından kullanılır (shared kernel)
// Signal conditions delegated to signal-registry.ts

import type { SignalLabel, ComputedIndicators } from './types';
import {
  macdStrength, rsiStrength, stochRsiStrength, waveTrendStrength,
  dmiStrength, mfiStrength, smiStrength, aoStrength, cciStrength,
  wprStrength, diStrength, cmfStrength, adStrength, netvolStrength,
  madrStrength, almaStrength, bbStrength,
  macdSignal, rsiSignal, stochRsiSignal, waveTrendSignal,
  dmiSignal, mfiSignal, smiSignal, aoSignal, cciSignal,
  wprSignal, diSignal, cmfSignal, adSignal, netvolSignal,
  madrSignal, almaSignal, bbSignal,
  macdCross, rsiCross, stochRsiCross, waveTrendCross,
  dmiCross, mfiCross, smiCross, aoCross, cciCross,
  wprCross, diCross, cmfCross, adCross, netvolCross,
  madrCross, almaCross, bbCross,
} from '@/lib/ta/registry/signal-registry';
import type { SignalStrength, SignalDir } from '@/lib/ta/registry/signal-registry';

export type SignalMap = Record<string, SignalLabel>;

export type OverallResult = {
  label: SignalLabel;
  score: number;
  totalScore: number;
  signalCount: number;
};

const SCORE_MAP: Record<SignalLabel, number> = {
  'STRONG BUY': 2,
  'WEAK BUY': 1,
  'NEUTRAL': 0,
  'WEAK SELL': -1,
  'STRONG SELL': -2,
};

/** Map SignalStrength → SignalLabel */
function toLabel(s: SignalStrength): SignalLabel {
  switch (s) {
    case 'STRONG_BUY': return 'STRONG BUY';
    case 'WEAK_BUY': return 'WEAK BUY';
    case 'NEUTRAL': return 'NEUTRAL';
    case 'WEAK_SELL': return 'WEAK SELL';
    case 'STRONG_SELL': return 'STRONG SELL';
  }
}

/** Birikimli sinyal haritasına yeni sinyal ekle */
export function addSignal(
  signals: SignalMap,
  key: string,
  label: SignalLabel,
  accumulator: { totalScore: number; signalCount: number },
) {
  signals[key] = label;
  accumulator.totalScore += SCORE_MAP[label];
  accumulator.signalCount++;
}

/** Toplam skordan genel sinyali hesapla */
export function computeOverall(acc: { totalScore: number; signalCount: number }): OverallResult {
  if (acc.signalCount === 0) {
    return { label: 'NEUTRAL', score: 0, totalScore: 0, signalCount: 0 };
  }
  const avg = acc.totalScore / acc.signalCount;

  let label: SignalLabel;
  if (avg >= 1.5) label = 'STRONG BUY';
  else if (avg >= 0.5) label = 'WEAK BUY';
  else if (avg <= -1.5) label = 'STRONG SELL';
  else if (avg <= -0.5) label = 'WEAK SELL';
  else label = 'NEUTRAL';

  return { label, score: avg, totalScore: acc.totalScore, signalCount: acc.signalCount };
}

/** Sinyal üretimi için gereken ham veri tipi (her indikatör kendi alanını doldurur) */
export function generateAllSignals(computedData: ComputedIndicators, candles: { close: number }[]): {
  signals: SignalMap;
  overall: OverallResult;
} {
  const signals: SignalMap = {};
  const acc = { totalScore: 0, signalCount: 0 };

  // MACD
  if (computedData.macd?.histogram && computedData.macd?.macd && computedData.macd?.signal) {
    const hist = computedData.macd.histogram;
    const mac = computedData.macd.macd;
    const sig = computedData.macd.signal;
    if (hist.length >= 2 && mac.length >= 2 && sig.length >= 2) {
      const lastHist = hist[hist.length - 1].value;
      const prevHist = hist[hist.length - 2].value;
      const lastMacd = mac[mac.length - 1].value;
      const prevMacd = mac[mac.length - 2].value;
      const lastSignal = sig[sig.length - 1].value;
      const prevSignal = sig[sig.length - 2].value;
      if (lastHist !== undefined && prevHist !== undefined && lastMacd !== undefined && prevMacd !== undefined && lastSignal !== undefined && prevSignal !== undefined) {
        addSignal(signals, 'macd', toLabel(macdStrength(lastMacd, lastSignal, lastHist, prevHist, prevMacd, prevSignal)), acc);
      }
    }
  }

  // RSI
  if (computedData.rsi?.rsi && computedData.rsi?.ma) {
    const rArr = computedData.rsi.rsi;
    const mArr = computedData.rsi.ma;
    if (rArr.length >= 2 && mArr.length >= 2) {
      const lastRSI = rArr[rArr.length - 1].value;
      const prevRSI = rArr[rArr.length - 2].value;
      const lastMA = mArr[mArr.length - 1].value;
      const prevMA = mArr[mArr.length - 2].value;
      if (lastRSI !== undefined && prevRSI !== undefined && lastMA !== undefined && prevMA !== undefined) {
        addSignal(signals, 'rsi', toLabel(rsiStrength(lastRSI, lastMA, prevRSI, prevMA)), acc);
      }
    }
  }

  // StochRSI
  if (computedData.stochrsi?.k && computedData.stochrsi?.d) {
    const kArr = computedData.stochrsi.k;
    const dArr = computedData.stochrsi.d;
    if (kArr.length >= 2 && dArr.length >= 2) {
      const lastK = kArr[kArr.length - 1].value;
      const prevK = kArr[kArr.length - 2].value;
      const lastD = dArr[dArr.length - 1].value;
      const prevD = dArr[dArr.length - 2].value;
      if (lastK !== undefined && prevK !== undefined && lastD !== undefined && prevD !== undefined) {
        addSignal(signals, 'stochrsi', toLabel(stochRsiStrength(lastK, lastD, prevK, prevD)), acc);
      }
    }
  }

  // WaveTrend
  if (computedData.wavetrend?.wt1 && computedData.wavetrend?.wt2) {
    const w1 = computedData.wavetrend.wt1;
    const w2 = computedData.wavetrend.wt2;
    if (w1.length >= 2 && w2.length >= 2) {
      const lastW1 = w1[w1.length - 1].value;
      const prevW1 = w1[w1.length - 2].value;
      const lastW2 = w2[w2.length - 1].value;
      const prevW2 = w2[w2.length - 2].value;
      if (lastW1 !== undefined && prevW1 !== undefined && lastW2 !== undefined && prevW2 !== undefined) {
        addSignal(signals, 'wavetrend', toLabel(waveTrendStrength(lastW1, lastW2, prevW1, prevW2)), acc);
      }
    }
  }

  // DMI
  if (computedData.dmi?.plusDI && computedData.dmi?.minusDI && computedData.dmi?.adx) {
    const plus = computedData.dmi.plusDI;
    const minus = computedData.dmi.minusDI;
    const adx = computedData.dmi.adx;
    if (plus.length >= 2 && minus.length >= 2 && adx.length >= 2) {
      const lPlus = plus[plus.length - 1].value;
      const pPlus = plus[plus.length - 2].value;
      const lMinus = minus[minus.length - 1].value;
      const pMinus = minus[minus.length - 2].value;
      const lAdx = adx[adx.length - 1].value;
      if (lPlus !== undefined && pPlus !== undefined && lMinus !== undefined && pMinus !== undefined && lAdx !== undefined) {
        addSignal(signals, 'dmi', toLabel(dmiStrength(lPlus, lMinus, lAdx, pPlus, pMinus)), acc);
      }
    }
  }

  // MFI
  if (computedData.mfi?.mfi) {
    const arr = computedData.mfi.mfi;
    if (arr.length >= 2) {
      const last = arr[arr.length - 1].value;
      const prev = arr[arr.length - 2].value;
      if (last !== undefined && prev !== undefined) {
        addSignal(signals, 'mfi', toLabel(mfiStrength(last, prev)), acc);
      }
    }
  }

  // SMI
  if (computedData.smi?.smi && computedData.smi?.signal && computedData.smi?.histogram) {
    const hist = computedData.smi.histogram;
    const sLine = computedData.smi.smi;
    const sigLine = computedData.smi.signal;
    if (hist.length >= 2 && sLine.length >= 2 && sigLine.length >= 2) {
      const lastHist = hist[hist.length - 1].value;
      const prevHist = hist[hist.length - 2].value;
      const lastSmi = sLine[sLine.length - 1].value;
      const prevSmi = sLine[sLine.length - 2].value;
      const lastSig = sigLine[sigLine.length - 1].value;
      const prevSig = sigLine[sigLine.length - 2].value;
      if (lastHist !== undefined && prevHist !== undefined && lastSmi !== undefined && prevSmi !== undefined && lastSig !== undefined && prevSig !== undefined) {
        addSignal(signals, 'smi', toLabel(smiStrength(lastSmi, lastSig, lastHist, prevHist, prevSmi, prevSig)), acc);
      }
    }
  }

  // AO
  if (computedData.ao && Array.isArray(computedData.ao) && computedData.ao.length >= 2) {
    const aoData = computedData.ao;
    const curr = aoData[aoData.length - 1].value;
    const prev = aoData[aoData.length - 2].value;
    if (curr !== undefined && prev !== undefined) {
      addSignal(signals, 'ao', toLabel(aoStrength(curr, prev)), acc);
    }
  }

  // CCI
  if (computedData.cci?.cci && computedData.cci?.ma) {
    const cArr = computedData.cci.cci;
    const mArr = computedData.cci.ma;
    if (cArr.length >= 2 && mArr.length >= 2) {
      const lastCCI = cArr[cArr.length - 1].value;
      const prevCCI = cArr[cArr.length - 2].value;
      const lastMA = mArr[mArr.length - 1].value;
      const prevMA = mArr[mArr.length - 2].value;
      if (lastCCI !== undefined && prevCCI !== undefined && lastMA !== undefined && prevMA !== undefined) {
        addSignal(signals, 'cci', toLabel(cciStrength(lastCCI, lastMA, prevCCI, prevMA)), acc);
      }
    }
  }

  // WPR
  if (computedData.wpr && Array.isArray(computedData.wpr) && computedData.wpr.length >= 2) {
    const wprData = computedData.wpr;
    const cur = wprData[wprData.length - 1].value;
    const prev = wprData[wprData.length - 2].value;
    if (cur !== undefined && prev !== undefined) {
      addSignal(signals, 'wpr', toLabel(wprStrength(cur, prev)), acc);
    }
  }

  // DI
  if (computedData.di && Array.isArray(computedData.di) && computedData.di.length >= 2) {
    const diData = computedData.di;
    const cur = diData[diData.length - 1].value;
    const prev = diData[diData.length - 2].value;
    if (cur !== undefined && prev !== undefined) {
      addSignal(signals, 'di', toLabel(diStrength(cur, prev)), acc);
    }
  }

  // CMF
  if (computedData.cmf && Array.isArray(computedData.cmf) && computedData.cmf.length >= 2) {
    const cmfData = computedData.cmf;
    const val = cmfData[cmfData.length - 1].value;
    const prevVal = cmfData[cmfData.length - 2].value;
    if (val !== undefined && prevVal !== undefined) {
      addSignal(signals, 'cmf', toLabel(cmfStrength(val, prevVal)), acc);
    }
  }

  // AD
  if (computedData.ad && computedData.ad.ad && computedData.ad.ma) {
    const adArr = computedData.ad.ad;
    const maArr = computedData.ad.ma;
    if (adArr.length >= 2 && maArr.length >= 2) {
      const cur = adArr[adArr.length - 1].value;
      const prev = adArr[adArr.length - 2].value;
      const curSMA = maArr[maArr.length - 1].value;
      const prevSMA = maArr[maArr.length - 2].value;
      if (cur !== undefined && prev !== undefined && curSMA !== undefined && prevSMA !== undefined) {
        addSignal(signals, 'ad', toLabel(adStrength(cur, prev, curSMA, prevSMA)), acc);
      }
    }
  }

  // Net Volume
  if (computedData.netvol && Array.isArray(computedData.netvol) && computedData.netvol.length >= 2) {
    const nvData = computedData.netvol;
    const cur = nvData[nvData.length - 1].value;
    const prev = nvData[nvData.length - 2].value;
    if (cur !== undefined && prev !== undefined) {
      addSignal(signals, 'netvol', toLabel(netvolStrength(cur, prev)), acc);
    }
  }

  // MADR
  if (computedData.madr && Array.isArray(computedData.madr) && computedData.madr.length >= 2) {
    const madrData = computedData.madr;
    const cur = madrData[madrData.length - 1].value;
    const prev = madrData[madrData.length - 2].value;
    if (cur !== undefined && prev !== undefined) {
      addSignal(signals, 'madr', toLabel(madrStrength(cur, prev)), acc);
    }
  }

  // ALMA
  if (computedData.alma && Array.isArray(computedData.alma) && computedData.alma.length >= 2 && candles.length >= 2) {
    const almaData = computedData.alma;
    const curA = almaData[almaData.length - 1].value;
    const prevA = almaData[almaData.length - 2].value;
    const curC = candles[candles.length - 1].close;
    const prevC = candles[candles.length - 2].close;
    if (curA !== undefined && prevA !== undefined && curC !== undefined && prevC !== undefined) {
      addSignal(signals, 'alma', toLabel(almaStrength(curA, prevA, curC, prevC)), acc);
    }
  }

  // Bollinger Bands
  if (computedData.bb && Array.isArray(computedData.bb) && computedData.bb.length >= 2 && candles.length >= 2) {
    const bbData = computedData.bb;
    const curBB = bbData[bbData.length - 1] as import('@/lib/ta/registry/signal-registry').BBPoint;
    const prevBB = bbData[bbData.length - 2] as import('@/lib/ta/registry/signal-registry').BBPoint;
    const curC = candles[candles.length - 1].close;
    const prevC = candles[candles.length - 2].close;
    if (curBB && prevBB && curBB.lower !== undefined && curBB.upper !== undefined && prevBB.lower !== undefined && prevBB.upper !== undefined && curC !== undefined && prevC !== undefined) {
      addSignal(signals, 'bb', toLabel(bbStrength(curBB, prevBB, curC, prevC)), acc);
    }
  }

  return { signals, overall: computeOverall(acc) };
}

// ─── Trade Marker Extraction ─────────────────────────────────────────────────

export type TradeMarker = {
  time: number;
  price: number;
  signal: "BUY" | "SELL";
  indicator: string;
};

const INDICATOR_EXTRACTORS: Record<string, (computed: ComputedIndicators, candles: CandleDataPoint[], i: number) => SignalDir> = {
  rsi: (c, _, i) => {
    const rsi = c.rsi?.rsi; const ma = c.rsi?.ma;
    if (!rsi || !ma || i < 1 || i >= rsi.length || i >= ma.length) return null;
    const val = rsi[i].value, prev = rsi[i-1].value, m = ma[i].value, pm = ma[i-1].value;
    if (val === undefined || prev === undefined || m === undefined || pm === undefined) return null;
    return rsiCross(val, m, prev, pm) ? (val > m ? "BUY" : "SELL") : null;
  },
  macd: (c, _, i) => {
    const macd = c.macd?.macd; const sig = c.macd?.signal;
    if (!macd || !sig || i < 1 || i >= macd.length || i >= sig.length) return null;
    const v = macd[i].value, pv = macd[i-1].value, s = sig[i].value, ps = sig[i-1].value;
    if (v === undefined || pv === undefined || s === undefined || ps === undefined) return null;
    return macdCross(v, s, pv, ps) ? (v > s ? "BUY" : "SELL") : null;
  },
  cci: (c, _, i) => {
    const cci = c.cci?.cci; const ma = c.cci?.ma;
    if (!cci || !ma || i < 1 || i >= cci.length || i >= ma.length) return null;
    const v = cci[i].value, pv = cci[i-1].value, m = ma[i].value, pm = ma[i-1].value;
    if (v === undefined || pv === undefined || m === undefined || pm === undefined) return null;
    return cciCross(v, pv) ? (v > 0 ? "BUY" : "SELL") : null;
  },
  stochrsi: (c, _, i) => {
    const k = c.stochrsi?.k; const d = c.stochrsi?.d;
    if (!k || !d || i < 1 || i >= k.length || i >= d.length) return null;
    const kv = k[i].value, pk = k[i-1].value, dv = d[i].value, pd = d[i-1].value;
    if (kv === undefined || pk === undefined || dv === undefined || pd === undefined) return null;
    return stochRsiCross(kv, dv, pk, pd) ? (kv > dv ? "BUY" : "SELL") : null;
  },
  wavetrend: (c, _, i) => {
    const w1 = c.wavetrend?.wt1; const w2 = c.wavetrend?.wt2;
    if (!w1 || !w2 || i < 1 || i >= w1.length || i >= w2.length) return null;
    const v1 = w1[i].value, p1 = w1[i-1].value, v2 = w2[i].value, p2 = w2[i-1].value;
    if (v1 === undefined || p1 === undefined || v2 === undefined || p2 === undefined) return null;
    return waveTrendCross(v1, v2, p1, p2) ? (v1 > v2 ? "BUY" : "SELL") : null;
  },
  dmi: (c, _, i) => {
    const p = c.dmi?.plusDI; const m = c.dmi?.minusDI;
    if (!p || !m || i < 1 || i >= p.length || i >= m.length) return null;
    const pv = p[i].value, pp = p[i-1].value, mv = m[i].value, pm = m[i-1].value;
    if (pv === undefined || pp === undefined || mv === undefined || pm === undefined) return null;
    return dmiCross(pv, mv, pp, pm) ? (pv > mv ? "BUY" : "SELL") : null;
  },
  smi: (c, _, i) => {
    const smi = c.smi?.smi; const sig = c.smi?.signal;
    if (!smi || !sig || i < 1 || i >= smi.length || i >= sig.length) return null;
    const sv = smi[i].value, ps = smi[i-1].value, gv = sig[i].value, pg = sig[i-1].value;
    if (sv === undefined || ps === undefined || gv === undefined || pg === undefined) return null;
    return smiCross(sv, gv, ps, pg) ? (sv > gv ? "BUY" : "SELL") : null;
  },
  ao: (c, _, i) => {
    const ao = c.ao; if (!ao || i < 1 || i >= ao.length) return null;
    const v = ao[i].value, pv = ao[i-1].value;
    if (v === undefined || pv === undefined) return null;
    return aoCross(v, pv) ? (v > 0 ? "BUY" : "SELL") : null;
  },
  mfi: (c, _, i) => {
    const mfi = c.mfi?.mfi; if (!mfi || i < 1 || i >= mfi.length) return null;
    const v = mfi[i].value, pv = mfi[i-1].value;
    if (v === undefined || pv === undefined) return null;
    return mfiCross(v, pv) ? (v > 50 ? "BUY" : "SELL") : null;
  },
  wpr: (c, _, i) => {
    const wpr = c.wpr; if (!wpr || i < 1 || i >= wpr.length) return null;
    const v = wpr[i].value, pv = wpr[i-1].value;
    if (v === undefined || pv === undefined) return null;
    return wprCross(v, pv) ? (v > -50 ? "BUY" : "SELL") : null;
  },
  di: (c, _, i) => {
    const di = c.di; if (!di || i < 1 || i >= di.length) return null;
    const v = di[i].value, pv = di[i-1].value;
    if (v === undefined || pv === undefined) return null;
    return diCross(v, pv) ? (v > 1.0 ? "BUY" : "SELL") : null;
  },
  cmf: (c, _, i) => {
    const cmf = c.cmf; if (!cmf || i < 1 || i >= cmf.length) return null;
    const v = cmf[i].value, pv = cmf[i-1].value;
    if (v === undefined || pv === undefined) return null;
    return cmfCross(v, pv) ? (v > 0 ? "BUY" : "SELL") : null;
  },
  ad: (c, _, i) => {
    const ad = c.ad?.ad; const ma = c.ad?.ma;
    if (!ad || !ma || i < 1 || i >= ad.length || i >= ma.length) return null;
    const v = ad[i].value, pv = ad[i-1].value, m = ma[i].value, pm = ma[i-1].value;
    if (v === undefined || pv === undefined || m === undefined || pm === undefined) return null;
    return adCross(v, pv, m, pm) ? (v > m ? "BUY" : "SELL") : null;
  },
  netvol: (c, _, i) => {
    const nv = c.netvol; if (!nv || i < 1 || i >= nv.length) return null;
    const v = nv[i].value, pv = nv[i-1].value;
    if (v === undefined || pv === undefined) return null;
    return netvolCross(v, pv) ? (v > 0 ? "BUY" : "SELL") : null;
  },
  madr: (c, _, i) => {
    const madr = c.madr; if (!madr || i < 1 || i >= madr.length) return null;
    const v = madr[i].value, pv = madr[i-1].value;
    if (v === undefined || pv === undefined) return null;
    return madrCross(v, pv) ? (v > 0 ? "BUY" : "SELL") : null;
  },
  alma: (c, candles, i) => {
    const alma = c.alma; if (!alma || i < 1 || i >= alma.length || i >= candles.length) return null;
    const a = alma[i].value, pa = alma[i-1].value;
    const cp = candles[i].close, cpp = candles[i-1].close;
    if (a === undefined || pa === undefined || cp === undefined || cpp === undefined) return null;
    return almaCross(a, pa, cp, cpp) ? (cp > a ? "BUY" : "SELL") : null;
  },
  bb: (c, candles, i) => {
    const bb = c.bb; if (!bb || i < 1 || i >= bb.length || i >= candles.length) return null;
    const curBB = bb[i] as import('@/lib/ta/registry/signal-registry').BBPoint;
    const prevBB = bb[i-1] as import('@/lib/ta/registry/signal-registry').BBPoint;
    if (!curBB || !prevBB || curBB.lower === undefined || curBB.upper === undefined || prevBB.lower === undefined || prevBB.upper === undefined) return null;
    const cp = candles[i].close, cpp = candles[i-1].close;
    if (cp === undefined || cpp === undefined) return null;
    if (bbCross(curBB, prevBB, cp, cpp)) {
      return (cpp <= prevBB.lower && cp > curBB.lower) ? "BUY" : "SELL";
    }
    return null;
  },
};

/**
 * Tarar: computed indicator verisindeki tüm barları dolaşır,
 * aktif indikatörlerin kesişim noktalarını TradeMarker[] olarak döndürür.
 * Her marker: time, price (mum kapanışı), signal (BUY/SELL), indicator key.
 */
export function extractTradeMarkers(
  computed: ComputedIndicators,
  candles: CandleDataPoint[],
  activeIndicators: Set<string>,
): TradeMarker[] {
  const markers: TradeMarker[] = [];
  if (!candles || candles.length === 0) return markers;

  const startIdx = Math.max(1, Math.floor(candles.length * 0.05)); // %5 warmup

  for (let i = startIdx; i < candles.length; i++) {
    for (const key of activeIndicators) {
      const extractor = INDICATOR_EXTRACTORS[key];
      if (!extractor) continue;
      const sig = extractor(computed, candles, i);
      if (sig === "BUY" || sig === "SELL") {
        markers.push({
          time: candles[i].time as number,
          price: candles[i].close,
          signal: sig,
          indicator: key,
        });
      }
    }
  }

  // Time'a göre sırala
  markers.sort((a, b) => a.time - b.time);
  return markers;
}
