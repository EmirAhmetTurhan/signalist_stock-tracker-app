// lib/constants/indicators.ts — Single source of truth for all technical indicators
// When adding a new indicator, add ONE entry here. The system prompt,
// optimizer, and AI tools all derive their lists from this registry.

export interface IndicatorMeta {
  key: string;       // code identifier (lowercase, used in activeIndicators Set)
  name: string;      // display name
  optimizable: boolean;
}

export const INDICATOR_REGISTRY: readonly IndicatorMeta[] = [
  { key: 'rsi', name: 'RSI', optimizable: true },
  { key: 'macd', name: 'MACD', optimizable: true },
  { key: 'stochrsi', name: 'StochRSI', optimizable: true },
  { key: 'wavetrend', name: 'WaveTrend', optimizable: true },
  { key: 'dmi', name: 'DMI', optimizable: true },
  { key: 'mfi', name: 'MFI', optimizable: true },
  { key: 'smi', name: 'SMI', optimizable: true },
  { key: 'ao', name: 'AO', optimizable: false },
  { key: 'cci', name: 'CCI', optimizable: true },
  { key: 'wpr', name: 'WPR', optimizable: true },
  { key: 'di', name: 'DI', optimizable: true },
  { key: 'cmf', name: 'CMF', optimizable: true },
  { key: 'ad', name: 'A/D', optimizable: false },
  { key: 'netvol', name: 'Net Volume', optimizable: false },
  { key: 'madr', name: 'MADR', optimizable: true },
  { key: 'alma', name: 'ALMA', optimizable: false },
  { key: 'bb', name: 'Bollinger', optimizable: false },
] as const;

export const INDICATOR_KEYS = INDICATOR_REGISTRY.map((i) => i.key);
export const INDICATOR_NAMES = INDICATOR_REGISTRY.map((i) => i.name);
export const INDICATOR_NAMES_STRING = INDICATOR_NAMES.join(', ');
export const OPTIMIZABLE_INDICATOR_NAMES = INDICATOR_REGISTRY.filter((i) => i.optimizable).map((i) => i.name);

export const DEFAULT_PARAMS = {
  macdFast: 12, macdSlow: 26, macdSig: 9,
  stochRsiLen: 14, stochLen: 14, stochK: 3, stochD: 3,
  wtAvgLen: 10, wtChannelLen: 21, wtMaLen: 4,
  dmiDiLen: 14, dmiAdxSmooth: 14,
  mfiPeriod: 14,
  smiLongLen: 14, smiShortLen: 3, smiSigLen: 3,
  rsiLen: 14, rsiMaLen: 14,
  cciLen: 20, cciMaLen: 14,
  wprLen: 14,
  diLen: 10, diSmooth: 10, diK: 2,
  cmfLen: 20,
  adLen: 21,
  madrLen: 21,
  almaLen: 9, almaOffset: 0.85, almaSigma: 6,
  almaColor: '#fbbf24', almaOpacity: 100, almaWidth: 2, almaStyle: 0,
  bbLen: 20, bbStdDev: 2, bbOffset: 0,
  bbColor: '#3b82f6', bbOpacity: 100, bbWidth: 1,
};
