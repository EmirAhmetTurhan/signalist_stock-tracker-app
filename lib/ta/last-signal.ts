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
      const rsi = last(data.rsiData?.rsi ?? [])?.value;
      const ma = last(data.rsiData?.ma ?? [])?.value;
      if (rsi === undefined || ma === undefined) return '—';
      return toDisplay(rsiSignal(rsi, ma));
    }
    case 'cci': {
      const cur = last(data.cciData?.cci ?? [])?.value;
      const ma = last(data.cciData?.ma ?? [])?.value;
      if (cur === undefined || ma === undefined) return '—';
      return toDisplay(cciSignal(cur, ma));
    }
    case 'wavetrend': {
      const wt1 = last(data.waveTrendData?.wt1 ?? [])?.value;
      const wt2 = last(data.waveTrendData?.wt2 ?? [])?.value;
      if (wt1 === undefined || wt2 === undefined) return '—';
      return toDisplay(waveTrendSignal(wt1, wt2));
    }
    case 'macd': {
      const m = last(data.macdData?.macd ?? [])?.value;
      const s = last(data.macdData?.signal ?? [])?.value;
      if (m === undefined || s === undefined) return '—';
      return toDisplay(macdSignal(m, s));
    }
    case 'stochrsi': {
      const k = last(data.stochRsiData?.k ?? [])?.value;
      const d = last(data.stochRsiData?.d ?? [])?.value;
      if (k === undefined || d === undefined) return '—';
      return toDisplay(stochRsiSignal(k, d));
    }
    case 'dmi': {
      const plus = last(data.dmiData?.plusDI ?? [])?.value;
      const minus = last(data.dmiData?.minusDI ?? [])?.value;
      if (plus === undefined || minus === undefined) return '—';
      return toDisplay(dmiSignal(plus, minus));
    }
    case 'smi': {
      const s = last(data.smiData?.smi ?? [])?.value;
      const g = last(data.smiData?.signal ?? [])?.value;
      if (s === undefined || g === undefined) return '—';
      return toDisplay(smiSignal(s, g));
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
      if (cur === undefined) return '—';
      return toDisplay(diSignal(cur));
    }
    case 'cmf': {
      const cur = last(data.cmfData ?? [])?.value;
      if (cur === undefined) return '—';
      return toDisplay(cmfSignal(cur));
    }
    case 'ad': {
      const adObj = data.adData;
      if (!adObj || !adObj.ad || !adObj.ma) return '—';
      const cur = last(adObj.ad)?.value;
      const sma = last(adObj.ma)?.value;
      if (cur === undefined || sma === undefined) return '—';
      return toDisplay(adSignal(cur, sma));
    }
    case 'netvol': {
      const cur = last(data.nvData ?? [])?.value;
      if (cur === undefined) return '—';
      return toDisplay(netvolSignal(cur));
    }
    case 'madr': {
      const cur = last(data.madrData ?? [])?.value;
      if (cur === undefined) return '—';
      return toDisplay(madrSignal(cur));
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
