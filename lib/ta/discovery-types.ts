// lib/ta/discovery-types.ts — Shared types for Deep Discovery pipeline
// Used across combinatorial-search, surrogate-optimizer, diversity-ranker,
// cross-validator, and Inngest job modules.

import type { StrategyMode } from './types';

// ─── Phase 2: Combinatorial Search Results ──────────────────────────────────────

/** Single result from exhaustive combinatorial search (Phase 2). */
export interface CombinationResult {
  /** Indicator keys in this combination (e.g. ['rsi', 'macd', 'dmi']) */
  combo: string[];
  /** lookForward value used for this test */
  lookForward: number;
  /** Voting mode used */
  mode: StrategyMode;
  /** Win rate from backtest (0-100) */
  winRate: number;
  /** Total signals generated */
  totalSignals: number;
  /** Composite score = winRate × √totalSignals */
  score: number;
  /** Profit factor (Phase 2b+) */
  profitFactor?: number;
  /** Sharpe ratio (Phase 2b+) */
  sharpeRatio?: number;
}

// ─── Phase 3: Surrogate Optimization Results ────────────────────────────────────

/** Result from surrogate-based parameter optimization (Phase 3). */
export interface SurrogateResult {
  /** Indicator keys in this combination */
  combo: string[];
  /** Optimized parameters (lookForward + indicator-specific params) */
  bestParams: Record<string, number>;
  /** Best win rate achieved after optimization (0-100) */
  bestWinRate: number;
  /** Total signals at best params */
  totalSignals: number;
  /** Number of optimization iterations actually run */
  iterationsRun: number;
  /** Voting mode that produced best result */
  mode: StrategyMode;
  /** Profit factor (Phase 2b+) */
  profitFactor?: number;
  /** Sharpe ratio (Phase 2b+) */
  sharpeRatio?: number;
}

// ─── Phase 4: Diversity-Ranked Results ──────────────────────────────────────────

/** Diversity badge label (e.g. "2-IND", "5-IND") */
export type DiversityBadge = `${number}-IND`;

/** Result after diversity ranking (Phase 4). */
export interface DiverseStrategy extends SurrogateResult {
  /** Number of indicators in this strategy */
  indicatorCount: number;
  /** Diversity badge label */
  badge: DiversityBadge;
  /** Rank within Top 10 (1-based) */
  rank: number;
}

// ─── Phase 5: Cross-Validated Results ───────────────────────────────────────────

/** Overfitting risk level with emoji badge. */
export type RiskLevel = 'low' | 'medium' | 'high';

/** Risk badge mapping for display. */
export const RISK_BADGES: Record<RiskLevel, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🔴',
};

/** Thresholds for overfitting risk classification. */
export const RISK_THRESHOLDS = {
  low: 0.10,     // < 10% degradation
  medium: 0.25,  // 10-25% degradation
  // > 25% = high
} as const;

/** Final validated strategy after cross-validation (Phase 5). */
export interface ValidatedStrategy extends DiverseStrategy {
  validatedWinRate: number;
  overfittingRisk: number;
  riskLevel: RiskLevel;
  riskBadge: string;
  avgTrainWinRate: number;
  regimeBreakdown?: Record<string, {
    winRate: number;
    totalSignals: number;
    wins: number;
    avgReturn: number;
    totalReturn: number;
  }>;
  // ─── Path-Aware + Portfolio Fields (populated when evaluationMode != 'lookforward') ───
  evaluationMode?: 'lookforward' | 'pathaware' | 'regime';
  mfe?: number;
  mae?: number;
  intraTradeDD?: number;
  equityCurveResampled?: { time: string; equity: number }[];
  drawdownCurveResampled?: { time: string; drawdownPct: number }[];
}

// ─── Progress Tracking ──────────────────────────────────────────────────────────

/** Phase names for progress display (v2 pipeline). */
export const PHASE_NAMES: Record<number, string> = {
  1: 'Data Preparation',
  2: 'MI Filter + MCTS Search',
  3: 'Hyperband + DE Optimization',
  4: 'Strategy Portfolio Building',
  5: 'Saving Results',
};

/** Progress state for a deep discovery job. */
export interface DeepDiscoveryProgress {
  /** Current phase (1-5) */
  currentPhase: number;
  /** Current progress within the phase */
  current: number;
  /** Total work items in the phase */
  total: number;
  /** Human-readable detail message */
  detail: string;
}

/** Input parameters for starting a deep discovery job. */
export interface DeepDiscoveryInput {
  symbol: string;
  interval: '1d' | '4h';
  years: number;
  seed?: number;
}
