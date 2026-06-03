// lib/ta/compute.ts — İndikatör hesaplama orkestratörü
// Hem TA sayfası (sunucu) hem de AI Agent tools (sunucu) tarafından kullanılır

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

/** Kullanıcının seçtiği indikatörleri hesapla. Sadece activeIndicators içinde olanlar çalışır. */
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
      macd: series.map((x) => ({ time: x.time, value: x.macd as number })),
      signal: series.map((x) => ({ time: x.time, value: x.signal as number })),
      histogram: series.map((x) => ({
        time: x.time, value: x.histogram as number,
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
      rsi: series.map((x) => ({ time: x.time, value: x.rsi as number })),
      ma: series.map((x) => ({ time: x.time, value: x.ma as number })),
      // SPRINT 1 / B4.1: Confidence pass-through (DST fusion tüketecek)
      confidence: series.map((x) => x.confidence),
    };
  }

  if (activeIndicators.has('stochrsi')) {
    const series = computeStochRSI(
      candles.map((c) => ({ time: c.time, close: c.close })),
      p.stochRsiLen, p.stochLen, p.stochK, p.stochD,
    );
    result.stochrsi = {
      k: series.map((x) => ({ time: x.time, value: x.k as number })),
      d: series.map((x) => ({ time: x.time, value: x.d as number })),
    };
  }

  if (activeIndicators.has('wavetrend')) {
    const series = computeWaveTrend(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      p.wtAvgLen, p.wtChannelLen, p.wtMaLen,
    );
    result.wavetrend = {
      wt1: series.map((x) => ({ time: x.time, value: x.wt1 as number })),
      wt2: series.map((x) => ({ time: x.time, value: x.wt2 as number })),
      crosses: series.filter((x) => x.cross === 1 || x.cross === -1).map((x) => ({ time: x.time, cross: x.cross as 1 | -1 })),
      // SPRINT 1 / B4.1: wt1 ve wt2 için ayrı confidence pass-through
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
      plusDI: series.map((x) => ({ time: x.time, value: x.plusDI as number })),
      minusDI: series.map((x) => ({ time: x.time, value: x.minusDI as number })),
      adx: series.map((x) => ({ time: x.time, value: x.adx as number })),
    };
  }

  if (activeIndicators.has('mfi')) {
    const series = computeMFI(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume })),
      p.mfiPeriod,
    );
    result.mfi = { mfi: series.map((x) => ({ time: x.time, value: x.mfi as number })) };
  }

  if (activeIndicators.has('smi')) {
    const series = computeSMI(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      p.smiLongLen, p.smiShortLen, p.smiSigLen,
    );
    result.smi = {
      smi: series.map((x) => ({ time: x.time, value: x.smi as number })),
      signal: series.map((x) => ({ time: x.time, value: x.signal as number })),
      histogram: series.map((x) => ({
        time: x.time, value: x.histogram as number,
        color: (x.histogram as number) >= 0 ? '#0db27a' : '#ef4444',
      })),
    };
  }

  if (activeIndicators.has('ao')) {
    result.ao = computeAO(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low })),
    ).map((x) => ({ time: x.time, value: x.value }));
  }

  if (activeIndicators.has('cci')) {
    const series = computeCCI(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      p.cciLen, p.cciMaLen,
    );
    result.cci = {
      cci: series.map((x) => ({ time: x.time, value: x.cci as number })),
      ma: series.map((x) => ({ time: x.time, value: x.ma as number })),
    };
  }

  if (activeIndicators.has('wpr')) {
    result.wpr = computeWPR(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close })),
      p.wprLen,
    ).map((x) => ({ time: x.time, value: x.value }));
  }

  if (activeIndicators.has('di')) {
    result.di = computeDemandIndex(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, open: c.open, volume: c.volume || 0 })),
      p.diLen, p.diSmooth,
    ).map((x) => ({ time: x.time, value: x.value }));
  }

  if (activeIndicators.has('cmf')) {
    result.cmf = computeCMF(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })),
      p.cmfLen,
    ).map((x) => ({ time: x.time, value: x.value }));
  }

  if (activeIndicators.has('ad')) {
    result.ad = computeAD(
      candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 })),
    ).map((x) => ({ time: x.time, value: x.value }));
  }

  if (activeIndicators.has('netvol')) {
    result.netvol = computeNetVolume(
      candles.map((c) => ({ time: c.time, open: c.open, close: c.close, volume: c.volume || 0 })),
    ).map((x) => ({ time: x.time, value: x.value }));
  }

  if (activeIndicators.has('madr')) {
    result.madr = computeMADR(
      candles.map((c) => ({ time: c.time, close: c.close })),
      p.madrLen,
    ).map((x) => ({ time: x.time, value: x.value }));
  }

  if (activeIndicators.has('alma')) {
    result.alma = computeALMA(closes, p.almaLen, p.almaOffset, p.almaSigma) as TimePoint[];
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

/** Yardımcı: ind parametresinden Set oluştur (virgülle ayrılmış) */
export function parseActiveIndicators(indParam: string): Set<string> {
  return new Set(indParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}
