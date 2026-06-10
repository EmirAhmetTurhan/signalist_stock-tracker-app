// lib/ta/signals.ts — İndikatör sinyal üretimi ve genel skor hesaplama
// Hem TA sayfası hem de AI Agent tarafından kullanılır (shared kernel)
// Signal conditions delegated to signal-registry.ts

import type { SignalLabel, ComputedIndicators } from './types';
import {
  macdStrength, rsiStrength, stochRsiStrength, waveTrendStrength,
  dmiStrength, mfiStrength, smiStrength, aoStrength, cciStrength,
  wprStrength, diStrength, cmfStrength, adStrength, netvolStrength,
  madrStrength, almaStrength, bbStrength,
} from '@/lib/ta/registry/signal-registry';
import type { SignalStrength } from '@/lib/ta/registry/signal-registry';

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
    if (hist.length >= 2) {
      const lastHist = hist[hist.length - 1].value!;
      const prevHist = hist[hist.length - 2].value!;
      const lastMacd = mac[mac.length - 1].value!;
      const lastSignal = sig[sig.length - 1].value!;
      addSignal(signals, 'macd', toLabel(macdStrength(lastMacd, lastSignal, lastHist, prevHist)), acc);
    }
  }

  // RSI
  if (computedData.rsi?.rsi && computedData.rsi?.ma) {
    const rArr = computedData.rsi.rsi;
    const mArr = computedData.rsi.ma;
    if (rArr.length > 0 && mArr.length > 0) {
      const lastRSI = rArr[rArr.length - 1].value!;
      const lastMA = mArr[mArr.length - 1].value!;
      addSignal(signals, 'rsi', toLabel(rsiStrength(lastRSI, lastMA)), acc);
    }
  }

  // StochRSI
  if (computedData.stochrsi?.k && computedData.stochrsi?.d) {
    const kArr = computedData.stochrsi.k;
    const dArr = computedData.stochrsi.d;
    if (kArr.length > 0 && dArr.length > 0) {
      const lastK = kArr[kArr.length - 1].value!;
      const lastD = dArr[dArr.length - 1].value!;
      addSignal(signals, 'stochrsi', toLabel(stochRsiStrength(lastK, lastD)), acc);
    }
  }

  // WaveTrend
  if (computedData.wavetrend?.wt1 && computedData.wavetrend?.wt2) {
    const w1 = computedData.wavetrend.wt1;
    const w2 = computedData.wavetrend.wt2;
    if (w1.length > 0 && w2.length > 0) {
      const lastW1 = w1[w1.length - 1].value!;
      const lastW2 = w2[w2.length - 1].value!;
      addSignal(signals, 'wavetrend', toLabel(waveTrendStrength(lastW1, lastW2)), acc);
    }
  }

  // DMI
  if (computedData.dmi?.plusDI && computedData.dmi?.minusDI && computedData.dmi?.adx) {
    const plus = computedData.dmi.plusDI;
    const minus = computedData.dmi.minusDI;
    const adx = computedData.dmi.adx;
    if (plus.length > 0 && minus.length > 0 && adx.length > 0) {
      const lPlus = plus[plus.length - 1].value!;
      const lMinus = minus[minus.length - 1].value!;
      const lAdx = adx[adx.length - 1].value!;
      addSignal(signals, 'dmi', toLabel(dmiStrength(lPlus, lMinus, lAdx)), acc);
    }
  }

  // MFI
  if (computedData.mfi?.mfi) {
    const arr = computedData.mfi.mfi;
    if (arr.length >= 2) {
      const last = arr[arr.length - 1].value!;
      const prev = arr[arr.length - 2].value!;
      addSignal(signals, 'mfi', toLabel(mfiStrength(last, prev)), acc);
    }
  }

  // SMI
  if (computedData.smi?.smi && computedData.smi?.signal && computedData.smi?.histogram) {
    const hist = computedData.smi.histogram;
    const sLine = computedData.smi.smi;
    const sigLine = computedData.smi.signal;
    if (hist.length >= 2) {
      const lastHist = hist[hist.length - 1].value!;
      const prevHist = hist[hist.length - 2].value!;
      const lastSmi = sLine[sLine.length - 1].value!;
      const lastSig = sigLine[sigLine.length - 1].value!;
      addSignal(signals, 'smi', toLabel(smiStrength(lastSmi, lastSig, lastHist, prevHist)), acc);
    }
  }

  // AO
  if (computedData.ao && Array.isArray(computedData.ao) && computedData.ao.length >= 2) {
    const aoData = computedData.ao;
    const curr = aoData[aoData.length - 1].value!;
    const prev = aoData[aoData.length - 2].value!;
    addSignal(signals, 'ao', toLabel(aoStrength(curr, prev)), acc);
  }

  // CCI
  if (computedData.cci?.cci && computedData.cci?.ma) {
    const cArr = computedData.cci.cci;
    const mArr = computedData.cci.ma;
    if (cArr.length > 0 && mArr.length > 0) {
      const lCCI = cArr[cArr.length - 1].value!;
      const lMA = mArr[mArr.length - 1].value!;
      addSignal(signals, 'cci', toLabel(cciStrength(lCCI, lMA)), acc);
    }
  }

  // WPR
  if (computedData.wpr && Array.isArray(computedData.wpr) && computedData.wpr.length >= 2) {
    const wprData = computedData.wpr;
    const cur = wprData[wprData.length - 1].value!;
    const prev = wprData[wprData.length - 2].value!;
    addSignal(signals, 'wpr', toLabel(wprStrength(cur, prev)), acc);
  }

  // DI
  if (computedData.di && Array.isArray(computedData.di) && computedData.di.length >= 2) {
    const diData = computedData.di;
    const cur = diData[diData.length - 1].value!;
    const prev = diData[diData.length - 2].value!;
    addSignal(signals, 'di', toLabel(diStrength(cur, prev)), acc);
  }

  // CMF
  if (computedData.cmf && Array.isArray(computedData.cmf) && computedData.cmf.length > 0) {
    const val = computedData.cmf[computedData.cmf.length - 1].value!;
    addSignal(signals, 'cmf', toLabel(cmfStrength(val)), acc);
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
    const cur = nvData[nvData.length - 1].value!;
    const prev = nvData[nvData.length - 2].value!;
    addSignal(signals, 'netvol', toLabel(netvolStrength(cur, prev)), acc);
  }

  // MADR
  if (computedData.madr && Array.isArray(computedData.madr) && computedData.madr.length >= 2) {
    const madrData = computedData.madr;
    const cur = madrData[madrData.length - 1].value!;
    const prev = madrData[madrData.length - 2].value!;
    addSignal(signals, 'madr', toLabel(madrStrength(cur, prev)), acc);
  }

  // ALMA
  if (computedData.alma && Array.isArray(computedData.alma) && computedData.alma.length >= 2) {
    const almaData = computedData.alma;
    const curA = almaData[almaData.length - 1].value!;
    const prevA = almaData[almaData.length - 2].value!;
    const curC = candles[candles.length - 1].close;
    const prevC = candles[candles.length - 2].close;
    addSignal(signals, 'alma', toLabel(almaStrength(curA, prevA, curC, prevC)), acc);
  }

  // Bollinger Bands
  if (computedData.bb && Array.isArray(computedData.bb) && computedData.bb.length >= 2) {
    const bbData = computedData.bb;
    const curBB = bbData[bbData.length - 1] as import('@/lib/ta/registry/signal-registry').BBPoint;
    const prevBB = bbData[bbData.length - 2] as import('@/lib/ta/registry/signal-registry').BBPoint;
    const curC = candles[candles.length - 1].close;
    const prevC = candles[candles.length - 2].close;
    addSignal(signals, 'bb', toLabel(bbStrength(curBB, prevBB, curC, prevC)), acc);
  }

  return { signals, overall: computeOverall(acc) };
}
