// lib/ta/compute.ts — Indicator computation orchestrator
// Used by both TA page (server) and AI Agent tools (server)

import { computeMACD } from '@/lib/indicators/macd';
import { computeRSI } from '@/lib/indicators/rsi';
import { computeStochRSI } from '@/lib/indicators/stochrsi';
import { computeWaveTrend } from '@/lib/indicators/wavetrend';
import { computeDMI } from '@/lib/indicators/dmi';
import { computeMFI } from '@/lib/indicators/mfi';
import { computeSMI } from '@/lib/indicators/smi';
import { computeAO } from '@/lib/indicators/ao';
import { computeCCI } from '@/lib/indicators/cci';
import { computeWPR } from '@/lib/indicators/wpr';
import { computeDemandIndex } from '@/lib/indicators/demand_index';
import { computeCMF } from '@/lib/indicators/cmf';
import { computeAD } from '@/lib/indicators/ad';
import { computeNetVolume } from '@/lib/indicators/net_volume';
import { computeMADR } from '@/lib/indicators/madr';
import { computeALMA } from '@/lib/indicators/alma';
import { computeBollingerBands } from '@/lib/indicators/bollinger';
import { detectCandlePatterns } from '@/lib/indicators/candlePatterns';
import { detectHistoricalFractals } from '@/lib/indicators/historicalFractals';
import { detectSupportResistance } from '@/lib/indicators/supportResistance';
import type { IndicatorParams, CandleInput, TimePoint, ComputedIndicators } from './types';

/** Helper: wrap a value as number | null, filtering out NaN/undefined. */
const safeNum = (v: unknown): number | undefined =>
  typeof v === 'number' && !isNaN(v) ? v : undefined;

/** Compute only the indicators specified in activeIndicators. */
export function computeIndicators(
  candles: CandleInput[],
  activeIndicators: Set<string>,
  p: IndicatorParams,
): ComputedIndicators {
  if (!candles || candles.length === 0) return {};

  const result: ComputedIndicators = {};
  const closes = candles.map((c) => ({ time: c.time, close: c.close }));

  if (activeIndicators.has('macd')) {
    const series = computeMACD(
      candles.map((c) => ({ time: c.time, close: c.close })),
      p.macdFast, p.macdSlow, p.macdSig,
    );
    result.macd = {
      macd: series.map((x) => ({ time: x.time, value: safeNum(x.macd) })),
      signal: series.map((x) => ({ time: x.time, value: safeNum(x.signal) })),
      histogram: series.map((x) => ({
        time: x.time, value: safeNum(x.histogram),
        color: (x.histogram as number) >= 0 ? '#0db27a' : '#ef4444',
      })),
    };
  }

  if (activeIndicators.has('rsi')) {
    const series = computeRSI(
      candles.map((c) => ({ time: c.time, close: c.close })),
      p.rsiLen, p.rsiMaLen,
    );
    result.rsi = {
      rsi: series.map((x) => ({ time: x.time, value: safeNum(x.rsi) })),
      ma: series.map((x) => ({ time: x.time, value: safeNum(x.ma) })),
      // SPRINT 1 / B4.1: Confidence pass-through (consumed by DST fusion)
      confidence: series.map((x) => x.confidence),
    };
  }

  if (activeIndicators.has('stochrsi')) {
    const series = computeStochRSI(
      candles.map((c) => ({ time: c.time, close: c.close })),
      p.stochRsiLen, p.stochLen, p.stochK, p.stochD,
    );
    result.stochrsi = {
      k: series.map((x) => ({ time: x.time, value: safeNum(x.k) })),
      d: series.map((x) => ({ time: x.time, value: safeNum(x.d) })),
    };
  }

  if (activeIndicators.has('wavetrend')) {
    const series = computeWaveTrend(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      p.wtAvgLen, p.wtChannelLen, p.wtMaLen,
    );
    result.wavetrend = {
      wt1: series.map((x) => ({ time: x.time, value: safeNum(x.wt1) })),
      wt2: series.map((x) => ({ time: x.time, value: safeNum(x.wt2) })),
      crosses: series.filter((x) => x.cross === 1 || x.cross === -1).map((x) => ({ time: x.time, cross: x.cross as 1 | -1 })),
      // SPRINT 1 / B4.1: Separate confidence pass-through for wt1 and wt2
      wt1Confidence: series.map((x) => x.wt1Confidence),
      wt2Confidence: series.map((x) => x.wt2Confidence),
    };
  }

  if (activeIndicators.has('dmi')) {
    const series = computeDMI(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      p.dmiDiLen, p.dmiAdxSmooth,
    );
    result.dmi = {
      plusDI: series.map((x) => ({ time: x.time, value: safeNum(x.plusDI) })),
      minusDI: series.map((x) => ({ time: x.time, value: safeNum(x.minusDI) })),
      adx: series.map((x) => ({ time: x.time, value: safeNum(x.adx) })),
    };
  }

  if (activeIndicators.has('mfi')) {
    const series = computeMFI(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume })),
      p.mfiPeriod,
    );
    result.mfi = { mfi: series.map((x) => ({ time: x.time, value: safeNum(x.mfi) })) };
  }

  if (activeIndicators.has('smi')) {
    const series = computeSMI(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      p.smiLongLen, p.smiShortLen, p.smiSigLen,
    );
    result.smi = {
      smi: series.map((x) => ({ time: x.time, value: safeNum(x.smi) })),
      signal: series.map((x) => ({ time: x.time, value: safeNum(x.signal) })),
      histogram: series.map((x) => ({
        time: x.time, value: safeNum(x.histogram),
        color: (x.histogram as number) >= 0 ? '#0db27a' : '#ef4444',
      })),
    };
  }

  if (activeIndicators.has('ao')) {
    result.ao = computeAO(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low })),
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('cci')) {
    const series = computeCCI(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      p.cciLen, p.cciMaLen,
    );
    result.cci = {
      cci: series.map((x) => ({ time: x.time, value: safeNum(x.cci) })),
      ma: series.map((x) => ({ time: x.time, value: safeNum(x.ma) })),
    };
  }

  if (activeIndicators.has('wpr')) {
    result.wpr = computeWPR(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      p.wprLen,
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('di')) {
    result.di = computeDemandIndex(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, open: c.open, volume: c.volume || 0 })),
      p.diLen, p.diSmooth,
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('cmf')) {
    result.cmf = computeCMF(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })),
      p.cmfLen,
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('ad')) {
    result.ad = computeAD(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })),
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('netvol')) {
    result.netvol = computeNetVolume(
      candles.map((c) => ({ time: c.time, open: c.open, close: c.close, volume: c.volume || 0 })),
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('madr')) {
    result.madr = computeMADR(
      candles.map((c) => ({ time: c.time, close: c.close })),
      p.madrLen,
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('alma')) {
    result.alma = (computeALMA(closes, p.almaLen, p.almaOffset, p.almaSigma) as Array<{ time: number; value?: number }>)
      .map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('bb')) {
    result.bb = computeBollingerBands(closes, p.bbLen, p.bbStdDev, p.bbOffset);
  }

  if (activeIndicators.has('patterns')) {
    const patterns = detectCandlePatterns(candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    result.candlePatterns = patterns;
  }

  if (activeIndicators.has('fractals')) {
    result.fractals = detectHistoricalFractals(
      candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
  }

  if (activeIndicators.has('sr')) {
    result.sr = detectSupportResistance(
      candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
  }

  return result;
}

/** Helper: parse comma-separated indicator names into a Set */
export function parseActiveIndicators(indParam: string): Set<string> {
  return new Set(indParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}