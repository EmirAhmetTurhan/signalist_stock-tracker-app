// lib/constants/indicators.ts — Single source of truth for all technical indicators
// When adding a new indicator, add ONE entry here. The system prompt,
// optimizer, and AI tools all derive their lists from this registry.

export interface IndicatorMeta {
  key: string;       // code identifier (lowercase, used in activeIndicators Set)
  name: string;      // display name
  optimizable: boolean;
}

export const INDICATOR_REGISTRY: readonly IndicatorMeta[] = [
  { key: 'rsi',        name: 'RSI',        optimizable: true },
  { key: 'macd',       name: 'MACD',       optimizable: true },
  { key: 'stochrsi',   name: 'StochRSI',   optimizable: true },
  { key: 'wavetrend',  name: 'WaveTrend',  optimizable: true },
  { key: 'dmi',        name: 'DMI',        optimizable: true },
  { key: 'mfi',        name: 'MFI',        optimizable: true },
  { key: 'smi',        name: 'SMI',        optimizable: true },
  { key: 'ao',         name: 'AO',         optimizable: false },
  { key: 'cci',        name: 'CCI',        optimizable: true },
  { key: 'wpr',        name: 'WPR',        optimizable: true },
  { key: 'di',         name: 'DI',         optimizable: true },
  { key: 'cmf',        name: 'CMF',        optimizable: true },
  { key: 'ad',         name: 'A/D',        optimizable: false },
  { key: 'netvol',     name: 'Net Volume', optimizable: false },
  { key: 'madr',       name: 'MADR',       optimizable: true },
  { key: 'alma',       name: 'ALMA',       optimizable: false },
  { key: 'bb',         name: 'Bollinger',  optimizable: false },
] as const;

export const INDICATOR_NAMES = INDICATOR_REGISTRY.map((i) => i.name);
export const INDICATOR_NAMES_STRING = INDICATOR_NAMES.join(', ');
export const OPTIMIZABLE_INDICATOR_NAMES = INDICATOR_REGISTRY.filter((i) => i.optimizable).map((i) => i.name);
