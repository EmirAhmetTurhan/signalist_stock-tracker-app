// lib/ta/last-signal.ts — Compute the most recent signal from indicator data
// Single source of truth for "what is the current signal?" queries.
// Used by CustomStrategyPanel and any component that needs last-signal display.

import {
  macdSignal, rsiSignal, stochRsiSignal, waveTrendSignal,
  dmiSignal, smiSignal, aoSignal, cciSignal,
  wprSignal, diSignal, cmfSignal, adSignal, netvolSignal,
  madrSignal, almaSignal, bbSignal, mfiSignal,
} from '@/lib/ta/registry/signal-registry';
import type { SignalDir, BBPoint } from '@/lib/ta/registry/signal-registry';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimeValuePoint { time?: string | number; value?: number }
interface BBDataPoint { time?: string | number; lower?: number; upper?: number; basis?: number }

/** Flattened indicator data shape as passed by TA page to CustomStrategyPanel. */
export interface AllIndicatorData {
  rsiData?: { rsi?: TimeValuePoint[]; ma?: TimeValuePoint[] };
  cciData?: { cci?: TimeValuePoint[]; ma?: TimeValuePoint[] };
  waveTrendData?: { wt1?: TimeValuePoint[]; wt2?: TimeValuePoint[] };
  macdData?: { macd?: TimeValuePoint[]; signal?: TimeValuePoint[] };
  stochRsiData?: { k?: TimeValuePoint[]; d?: TimeValuePoint[] };
  dmiData?: { plusDI?: TimeValuePoint[]; minusDI?: TimeValuePoint[] };
  smiData?: { smi?: TimeValuePoint[]; signal?: TimeValuePoint[] };
  aoData?: TimeValuePoint[];
  mfiData?: { mfi?: TimeValuePoint[] };
  wprData?: TimeValuePoint[];
  diData?: TimeValuePoint[];
  cmfData?: TimeValuePoint[];
  adData?: { ad?: TimeValuePoint[]; ma?: TimeValuePoint[] };
  nvData?: TimeValuePoint[];
  madrData?: TimeValuePoint[];
  almaData?: TimeValuePoint[];
  bbData?: BBDataPoint[];
}

interface CandleLike { close: number }

// ─── Helpers ────────────────────────────────────────────────────────────────

function toDisplay(s: SignalDir): 'BUY' | 'SELL' | '—' {
  switch (s) {
    case 'BUY': return 'BUY';
    case 'SELL': return 'SELL';
    default: return '—';
  }
}

function last<T>(arr: T[]): T | undefined {
  return arr[arr.length - 1];
}

// ─── Main function ──────────────────────────────────────────────────────────

/**
 * Returns the most recent BUY/SELL/— signal for a given indicator key.
 * Uses the signal-registry functions — single source of truth for signal logic.
 */
export function getLastSignal(
  key: string,
  data: AllIndicatorData,
  candles?: CandleLike[],
): 'BUY' | 'SELL' | '—' {
  switch (key) {
    case 'rsi': {
      const rsiArr = data.rsiData?.rsi ?? [];
      const maArr = data.rsiData?.ma ?? [];
      const rsi = last(rsiArr)?.value;
      const ma = last(maArr)?.value;
      const prevRsi = rsiArr[rsiArr.length - 2]?.value;
      const prevMa = maArr[maArr.length - 2]?.value;
      if (rsi === undefined || ma === undefined) return '—';
      return toDisplay(rsiSignal(rsi, ma, prevRsi, prevMa));
    }
    case 'cci': {
      const cciArr = data.cciData?.cci ?? [];
      const maArr = data.cciData?.ma ?? [];
      const cur = last(cciArr)?.value;
      const ma = last(maArr)?.value;
      const prevCci = cciArr[cciArr.length - 2]?.value;
      const prevMa = maArr[maArr.length - 2]?.value;
      if (cur === undefined || ma === undefined) return '—';
      return toDisplay(cciSignal(cur, ma, prevCci, prevMa));
    }
    case 'wavetrend': {
      const wt1Arr = data.waveTrendData?.wt1 ?? [];
      const wt2Arr = data.waveTrendData?.wt2 ?? [];
      const wt1 = last(wt1Arr)?.value;
      const wt2 = last(wt2Arr)?.value;
      const prevWt1 = wt1Arr[wt1Arr.length - 2]?.value;
      const prevWt2 = wt2Arr[wt2Arr.length - 2]?.value;
      if (wt1 === undefined || wt2 === undefined) return '—';
      return toDisplay(waveTrendSignal(wt1, wt2, prevWt1, prevWt2));
    }
    case 'macd': {
      const macdArr = data.macdData?.macd ?? [];
      const sigArr = data.macdData?.signal ?? [];
      const m = last(macdArr)?.value;
      const s = last(sigArr)?.value;
      const prevM = macdArr[macdArr.length - 2]?.value;
      const prevS = sigArr[sigArr.length - 2]?.value;
      if (m === undefined || s === undefined) return '—';
      return toDisplay(macdSignal(m, s, prevM, prevS));
    }
    case 'stochrsi': {
      const kArr = data.stochRsiData?.k ?? [];
      const dArr = data.stochRsiData?.d ?? [];
      const k = last(kArr)?.value;
      const d = last(dArr)?.value;
      const prevK = kArr[kArr.length - 2]?.value;
      const prevD = dArr[dArr.length - 2]?.value;
      if (k === undefined || d === undefined) return '—';
      return toDisplay(stochRsiSignal(k, d, prevK, prevD));
    }
    case 'dmi': {
      const plusArr = data.dmiData?.plusDI ?? [];
      const minusArr = data.dmiData?.minusDI ?? [];
      const plus = last(plusArr)?.value;
      const minus = last(minusArr)?.value;
      const prevPlus = plusArr[plusArr.length - 2]?.value;
      const prevMinus = minusArr[minusArr.length - 2]?.value;
      if (plus === undefined || minus === undefined) return '—';
      return toDisplay(dmiSignal(plus, minus, prevPlus, prevMinus));
    }
    case 'smi': {
      const smiArr = data.smiData?.smi ?? [];
      const sigArr = data.smiData?.signal ?? [];
      const s = last(smiArr)?.value;
      const g = last(sigArr)?.value;
      const prevS = smiArr[smiArr.length - 2]?.value;
      const prevG = sigArr[sigArr.length - 2]?.value;
      if (s === undefined || g === undefined) return '—';
      return toDisplay(smiSignal(s, g, prevS, prevG));
    }
    case 'ao': {
      const arr = data.aoData ?? [];
      const cur = arr[arr.length - 1]?.value;
      const prev = arr[arr.length - 2]?.value;
      if (cur === undefined || prev === undefined) return '—';
      return toDisplay(aoSignal(cur, prev));
    }
    case 'mfi': {
      const arr = data.mfiData?.mfi ?? [];
      const cur = arr[arr.length - 1]?.value;
      const prev = arr[arr.length - 2]?.value;
      if (cur === undefined || prev === undefined) return '—';
      return toDisplay(mfiSignal(cur, prev));
    }
    case 'wpr': {
      const arr = data.wprData ?? [];
      const cur = arr[arr.length - 1]?.value;
      const prev = arr[arr.length - 2]?.value;
      if (cur === undefined || prev === undefined) return '—';
      return toDisplay(wprSignal(cur, prev));
    }
    case 'di': {
      const arr = data.diData ?? [];
      const cur = arr[arr.length - 1]?.value;
      const prev = arr[arr.length - 2]?.value;
      if (cur === undefined) return '—';
      return toDisplay(diSignal(cur, prev));
    }
    case 'cmf': {
      const arr = data.cmfData ?? [];
      const cur = arr[arr.length - 1]?.value;
      const prev = arr[arr.length - 2]?.value;
      if (cur === undefined) return '—';
      return toDisplay(cmfSignal(cur, prev));
    }
    case 'ad': {
      const adObj = data.adData;
      if (!adObj || !adObj.ad || !adObj.ma) return '—';
      const cur = last(adObj.ad)?.value;
      const sma = last(adObj.ma)?.value;
      const prev = adObj.ad[adObj.ad.length - 2]?.value;
      const prevSma = adObj.ma[adObj.ma.length - 2]?.value;
      if (cur === undefined || sma === undefined) return '—';
      return toDisplay(adSignal(cur, sma, prev, prevSma));
    }
    case 'netvol': {
      const arr = data.nvData ?? [];
      const cur = arr[arr.length - 1]?.value;
      const prev = arr[arr.length - 2]?.value;
      if (cur === undefined) return '—';
      return toDisplay(netvolSignal(cur, prev));
    }
    case 'madr': {
      const arr = data.madrData ?? [];
      const cur = arr[arr.length - 1]?.value;
      const prev = arr[arr.length - 2]?.value;
      if (cur === undefined) return '—';
      return toDisplay(madrSignal(cur, prev));
    }
    case 'alma': {
      const arr = data.almaData ?? [];
      const curA = arr[arr.length - 1]?.value;
      const prevA = arr[arr.length - 2]?.value;
      const curC = candles?.[candles.length - 1]?.close;
      const prevC = candles?.[candles.length - 2]?.close;
      if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) return '—';
      return toDisplay(almaSignal(curA, prevA, curC, prevC));
    }
    case 'bb': {
      const arr = data.bbData ?? [];
      const curBB = arr[arr.length - 1];
      const prevBB = arr[arr.length - 2];
      const curC = candles?.[candles.length - 1]?.close;
      const prevC = candles?.[candles.length - 2]?.close;
      if (!curBB || !prevBB || curC === undefined || prevC === undefined
        || curBB.lower === undefined || prevBB.lower === undefined
        || curBB.upper === undefined || prevBB.upper === undefined
        || curBB.basis === undefined || prevBB.basis === undefined) return '—';
      return toDisplay(bbSignal(
        curBB as BBPoint, prevBB as BBPoint, curC, prevC,
      ));
    }
    default: return '—';
  }
}
