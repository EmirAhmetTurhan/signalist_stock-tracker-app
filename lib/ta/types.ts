// lib/ta/types.ts — Shared type definitions for Technical Analysis
// Used by both TA page and AI Agent

export type SignalLabel = 'STRONG BUY' | 'WEAK BUY' | 'STRONG SELL' | 'WEAK SELL' | 'NEUTRAL';

/** Timeframe string literal for data intervals across the TA module.
 *  SPRINT 3: '1wk' removed — only '4h' (swing) and '1d' (daily) are supported. */
export type Timeframe = '1d' | '4h';

/** Strategy decision mode: all must agree vs majority (>50%) */
export type StrategyMode = 'all' | 'majority';

/**
 * Signal Profile — determines the aggressiveness of signal generation.
 * - Aggressive: lower threshold, optional crossover, shorter cooldown (high-volatility adaptive)
 * - Balanced: default tuning, crossover required, moderate cooldown
 * - Conservative: higher threshold, crossover required, longer cooldown
 */
export type SignalProfile = 'TrendFollower' | 'SwingTrader' | 'Aggressive' | 'Balanced' | 'Conservative';

/**
 * Market regime classification for regime-aware strategy execution.
 * - uptrend: ADX > 25, price above MA, positive slope
 * - downtrend: ADX > 25, price below MA, negative slope
 * - ranging: ADX < 20, low volatility, no clear direction
 * - volatile: High ATR relative to price (crisis/shock)
 * - neutral: default when indicators are ambiguous
 */
export type MarketRegime = 'uptrend' | 'downtrend' | 'ranging' | 'volatile' | 'neutral';

/** Per-regime performance statistics for a strategy. */
export interface RegimeStats {
  winRate: number;
  totalSignals: number;
  wins: number;
  avgReturn: number;      // Average return % per trade in this regime
  totalReturn: number;    // Total return % across all trades in this regime
}

/** Dempster-Shafer Basic Belief Assignment over frame {Buy, Sell} */
export interface BBA {
  buy: number;         // Belief mass assigned to Buy
  sell: number;        // Belief mass assigned to Sell
  uncertainty: number; // Belief mass assigned to {Buy, Sell} (ignorance)
}

/** Per-indicator confidence with regime context for DST fusion */
export interface IndicatorConfidence {
  key: string;
  bba: BBA;
  regime: MarketRegime;
}

export const SIGNAL_STYLES: Record<SignalLabel, string> = {
  'STRONG BUY': 'bg-green-500/10 text-green-400 border border-green-500/30',
  'WEAK BUY': 'bg-green-500/5 text-green-300 border border-green-500/20',
  'STRONG SELL': 'bg-red-500/10 text-red-400 border border-red-500/30',
  'WEAK SELL': 'bg-red-500/5 text-red-300 border border-red-500/20',
  'NEUTRAL': 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30',
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
  adLen: number;
  madrLen: number;
  almaLen: number; almaOffset: number; almaSigma: number;
  almaColor: string; almaOpacity: number; almaWidth: number; almaStyle: number;
  bbLen: number; bbStdDev: number; bbOffset: number;
  bbColor: string; bbOpacity: number; bbWidth: number;
};

/** Unified Candle data type */
export type Candle = CandleDataPoint;
export type CandleInput = Candle;


/** Base point for indicator series */
export type TimePoint = {
  time: number;
  value?: number;
};

/** Bollinger Bands calculation output */
export type BBResult = {
  time: number;
  basis?: number;
  upper?: number;
  lower?: number;
};

/** MACD: macd + signal + histogram */
export type MACDSeries = {
  macd: TimePoint[];
  signal: TimePoint[];
  histogram: (TimePoint & { color: string })[];
};

/** RSI: rsi + ma */
export type RSISeries = {
  rsi: TimePoint[];
  ma: TimePoint[];
  /**
   * SPRINT 1 / B4.1: Per-bar RSI confidence (0|1).
   * Pipeline'a NaN/0 fallback sızmasını engellemek için tasarlandı:
   *   - 0 = warmup veya "no movement" fallback bar'ı
   *   - 1 = gerçek hesaplama
   * DST fusion bu diziyi okuyarak düşük güvenli barların oylama gücünü sıfırlar.
   */
  confidence?: number[];
};

/** StochRSI: k + d */
export type StochRSISeries = {
  k: TimePoint[];
  d: TimePoint[];
};

/** WaveTrend: wt1 + wt2 + crosses */
export type WaveTrendSeries = {
  wt1: TimePoint[];
  wt2: TimePoint[];
  crosses: { time: number; cross: 1 | -1 }[];
  /**
   * SPRINT 1 / B4.1: Per-bar WaveTrend confidence (0|1) — wt1 ve wt2 için ayrı ayrı.
   * CI hesabında DE=0 fallback tetiklenirse veya warmup içindeyse 0; aksi halde 1.
   * DST fusion bu dizileri ağırlıklandırma için kullanır.
   */
  wt1Confidence?: number[];
  wt2Confidence?: number[];
};

/** DMI: plusDI + minusDI + adx */
export type DMISeries = {
  plusDI: TimePoint[];
  minusDI: TimePoint[];
  adx: TimePoint[];
};

/** MFI: mfi */
export type MFISeries = {
  mfi: TimePoint[];
};

/** SMI: smi + signal + histogram */
export type SMISeries = {
  smi: TimePoint[];
  signal: TimePoint[];
  histogram: (TimePoint & { color: string })[];
};

/** CCI: cci + ma */
export type CCISeries = {
  cci: TimePoint[];
  ma: TimePoint[];
};

/** Indicator computation orchestrator output — populated for each computed indicator */
export type ComputedIndicators = {
  macd?: MACDSeries;
  rsi?: RSISeries;
  stochrsi?: StochRSISeries;
  wavetrend?: WaveTrendSeries;
  dmi?: DMISeries;
  mfi?: MFISeries;
  smi?: SMISeries;
  ao?: TimePoint[];
  cci?: CCISeries;
  wpr?: TimePoint[];
  di?: TimePoint[];
  cmf?: TimePoint[];
  ad?: { ad: TimePoint[]; ma: TimePoint[] };
  netvol?: TimePoint[];
  madr?: TimePoint[];
  alma?: TimePoint[];
  bb?: BBResult[];
  candlePatterns?: import('@/lib/indicators/candlePatterns').CandlePattern[];
  fractals?: import('@/lib/indicators/historicalFractals').FractalResult | null;
  sr?: import('@/lib/indicators/supportResistance').SRResult | null;
};

/**
 * Evaluation mode for backtest ground truth.
 * - 'lookforward': Legacy 2-point comparison (entry close vs. future close)
 * - 'pathaware': Bar-by-bar trade simulation with SL/TP/trailing stops
 * - 'regime': Path-aware + regime-dependent indicator confidence
 */
export type EvaluationMode = 'lookforward' | 'pathaware' | 'regime';
