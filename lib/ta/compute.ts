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
import { DEFAULT_PARAMS } from '@/lib/constants/indicators';

/** Helper: wrap a value as number | null, filtering out NaN/undefined. */
const safeNum = (v: unknown): number | undefined =>
  typeof v === 'number' && !isNaN(v) ? v : undefined;

/**
 * Normalizes input parameters (which can be camelCase, snake_case, or partial/missing)
 * into a fully-populated IndicatorParams object using DEFAULT_PARAMS as fallback.
 */
export function normalizeParams(p: any): IndicatorParams {
  const defaults = DEFAULT_PARAMS;
  if (!p) return { ...defaults };

  const getNum = (camel: string, snake: string, defVal: number): number => {
    const val = p[camel] !== undefined ? p[camel] : p[snake];
    if (val === undefined || val === null) return defVal;
    const num = Number(val);
    return isNaN(num) ? defVal : num;
  };

  const getStr = (camel: string, snake: string, defVal: string): string => {
    const val = p[camel] !== undefined ? p[camel] : p[snake];
    if (val === undefined || val === null) return defVal;
    return String(val);
  };

  return {
    macdFast: getNum('macdFast', 'macd_fast', defaults.macdFast),
    macdSlow: getNum('macdSlow', 'macd_slow', defaults.macdSlow),
    macdSig: getNum('macdSig', 'macd_sig', defaults.macdSig),
    stochRsiLen: getNum('stochRsiLen', 'stoch_rsi_len', defaults.stochRsiLen),
    stochLen: getNum('stochLen', 'stoch_len', defaults.stochLen),
    stochK: getNum('stochK', 'stoch_k', defaults.stochK),
    stochD: getNum('stochD', 'stoch_d', defaults.stochD),
    wtAvgLen: getNum('wtAvgLen', 'wt_avg_len', defaults.wtAvgLen),
    wtChannelLen: getNum('wtChannelLen', 'wt_channel_len', defaults.wtChannelLen),
    wtMaLen: getNum('wtMaLen', 'wt_ma_len', defaults.wtMaLen),
    dmiDiLen: getNum('dmiDiLen', 'dmi_di_len', defaults.dmiDiLen),
    dmiAdxSmooth: getNum('dmiAdxSmooth', 'dmi_adx_smooth', defaults.dmiAdxSmooth),
    mfiPeriod: getNum('mfiPeriod', 'mfi_period', defaults.mfiPeriod),
    smiLongLen: getNum('smiLongLen', 'smi_long_len', defaults.smiLongLen),
    smiShortLen: getNum('smiShortLen', 'smi_short_len', defaults.smiShortLen),
    smiSigLen: getNum('smiSigLen', 'smi_sig_len', defaults.smiSigLen),
    rsiLen: getNum('rsiLen', 'rsi_len', defaults.rsiLen),
    rsiMaLen: getNum('rsiMaLen', 'rsi_ma_len', defaults.rsiMaLen),
    cciLen: getNum('cciLen', 'cci_len', defaults.cciLen),
    cciMaLen: getNum('cciMaLen', 'cci_ma_len', defaults.cciMaLen),
    wprLen: getNum('wprLen', 'wpr_len', defaults.wprLen),
    diLen: getNum('diLen', 'di_len', defaults.diLen),
    diSmooth: getNum('diSmooth', 'di_smooth', defaults.diSmooth),
    diK: getNum('diK', 'di_k', defaults.diK),
    cmfLen: getNum('cmfLen', 'cmf_len', defaults.cmfLen),
    adLen: getNum('adLen', 'ad_len', defaults.adLen),
    madrLen: getNum('madrLen', 'madr_len', defaults.madrLen),
    almaLen: getNum('almaLen', 'alma_len', defaults.almaLen),
    almaOffset: getNum('almaOffset', 'alma_offset', defaults.almaOffset),
    almaSigma: getNum('almaSigma', 'alma_sigma', defaults.almaSigma),
    almaColor: getStr('almaColor', 'alma_color', defaults.almaColor),
    almaOpacity: getNum('almaOpacity', 'alma_opacity', defaults.almaOpacity),
    almaWidth: getNum('almaWidth', 'alma_width', defaults.almaWidth),
    almaStyle: getNum('almaStyle', 'alma_style', defaults.almaStyle),
    bbLen: getNum('bbLen', 'bb_len', defaults.bbLen),
    bbStdDev: getNum('bbStdDev', 'bb_stddev', defaults.bbStdDev),
    bbOffset: getNum('bbOffset', 'bb_offset', defaults.bbOffset),
    bbColor: getStr('bbColor', 'bb_color', defaults.bbColor),
    bbOpacity: getNum('bbOpacity', 'bb_opacity', defaults.bbOpacity),
    bbWidth: getNum('bbWidth', 'bb_width', defaults.bbWidth),
  };
}

/** Compute only the indicators specified in activeIndicators. */
export function computeIndicators(
  candles: CandleInput[],
  activeIndicators: Set<string>,
  p: IndicatorParams,
): ComputedIndicators {
  if (!candles || candles.length === 0) return {};

  const params = normalizeParams(p);
  const result: ComputedIndicators = {};
  const closes = candles.map((c) => ({ time: c.time, close: c.close }));

  if (activeIndicators.has('macd')) {
    const series = computeMACD(
      candles.map((c) => ({ time: c.time, close: c.close })),
      params.macdFast, params.macdSlow, params.macdSig,
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
      params.rsiLen, params.rsiMaLen,
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
      params.stochRsiLen, params.stochLen, params.stochK, params.stochD,
    );
    result.stochrsi = {
      k: series.map((x) => ({ time: x.time, value: safeNum(x.k) })),
      d: series.map((x) => ({ time: x.time, value: safeNum(x.d) })),
    };
  }

  if (activeIndicators.has('wavetrend')) {
    const series = computeWaveTrend(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      params.wtChannelLen, params.wtAvgLen, params.wtMaLen,
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
      params.dmiDiLen, params.dmiAdxSmooth,
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
      params.mfiPeriod,
    );
    result.mfi = { mfi: series.map((x) => ({ time: x.time, value: safeNum(x.mfi) })) };
  }

  if (activeIndicators.has('smi')) {
    const series = computeSMI(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      params.smiLongLen, params.smiShortLen, params.smiSigLen,
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
      params.cciLen, params.cciMaLen,
    );
    result.cci = {
      cci: series.map((x) => ({ time: x.time, value: safeNum(x.cci) })),
      ma: series.map((x) => ({ time: x.time, value: safeNum(x.ma) })),
    };
  }

  if (activeIndicators.has('wpr')) {
    result.wpr = computeWPR(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      params.wprLen,
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('di')) {
    result.di = computeDemandIndex(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, open: c.open, volume: c.volume || 0 })),
      params.diLen, params.diSmooth,
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('cmf')) {
    result.cmf = computeCMF(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })),
      params.cmfLen,
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('ad')) {
    const series = computeAD(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })),
    );
    const adSeries = series.map((x) => ({ time: x.time, value: safeNum(x.value) }));
    const maSeries = series.map((x, idx) => {
      let sum = 0;
      let count = 0;
      const start = Math.max(0, idx - params.adLen + 1);
      for (let j = start; j <= idx; j++) {
        const val = adSeries[j].value;
        if (val !== undefined) {
          sum += val;
          count++;
        }
      }
      return {
        time: x.time,
        value: count >= params.adLen ? sum / count : undefined,
      };
    });
    result.ad = {
      ad: adSeries,
      ma: maSeries,
    };
  }

  if (activeIndicators.has('netvol')) {
    result.netvol = computeNetVolume(
      candles.map((c) => ({ time: c.time, open: c.open, close: c.close, volume: c.volume || 0 })),
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('madr')) {
    result.madr = computeMADR(
      candles.map((c) => ({ time: c.time, close: c.close })),
      params.madrLen,
    ).map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('alma')) {
    result.alma = (computeALMA(closes, params.almaLen, params.almaOffset, params.almaSigma) as Array<{ time: number; value?: number }>)
      .map((x) => ({ time: x.time, value: safeNum(x.value) }));
  }

  if (activeIndicators.has('bb')) {
    result.bb = computeBollingerBands(closes, params.bbLen, params.bbStdDev, params.bbOffset);
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