// lib/ta/types.ts — Teknik Analiz için paylaşılan tip tanımları
// Hem TA sayfası hem de AI Agent tarafından kullanılır

export type SignalLabel = 'STRONG BUY' | 'WEAK BUY' | 'STRONG SELL' | 'WEAK SELL' | 'NEUTRAL';

export const SIGNAL_STYLES: Record<SignalLabel, string> = {
  'STRONG BUY': 'bg-green-900/40 text-green-300 border border-green-700',
  'WEAK BUY': 'bg-green-900/20 text-green-300/80 border border-green-700/60',
  'STRONG SELL': 'bg-red-900/40 text-red-300 border border-red-700',
  'WEAK SELL': 'bg-red-900/20 text-red-300/80 border border-red-700/60',
  'NEUTRAL': 'bg-gray-800 text-gray-400 border border-gray-700',
};

export type IndicatorParams = {
  macdFast: number; macdSlow: number; macdSig: number;
  stochRsiLen: number; stochLen: number; stochK: number; stochD: number;
  wtAvgLen: number; wtChannelLen: number; wtMaLen: number;
  dmiDiLen: number; dmiAdxSmooth: number;
  mfiPeriod: number;
  smiLongLen: number; smiShortLen: number; smiSigLen: number;
  rsiLen: number; rsiMaLen: number;
  cciLen: number; cciMaLen: number;
  wprLen: number;
  diLen: number; diSmooth: number; diK: number;
  cmfLen: number;
  madrLen: number;
  almaLen: number; almaOffset: number; almaSigma: number;
  almaColor: string; almaOpacity: number; almaWidth: number; almaStyle: number;
  bbLen: number; bbStdDev: number; bbOffset: number;
  bbColor: string; bbOpacity: number; bbWidth: number;
};
