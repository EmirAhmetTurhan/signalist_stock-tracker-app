// lib/ta/strategy-optimizer/types.ts
// Type definitions extracted from strategy-optimizer.ts

import type { BacktestHistoryItem } from '../simulation/backtest';
import type { BacktestLogEntry } from '../simulation/backtest-log';
import type { PortfolioSimResult, PortfolioSimConfig } from '../simulation/portfolio-simulator';
import type { TradeRiskConfig } from '../simulation/trade-simulator';
import type { MarketRegime, RegimeStats, SignalProfile, StrategyMode, EvaluationMode } from '../types';

type Series = { time: string | number; value?: number }[];

export interface AllData {
    rsiData?: { rsi: Series; ma: Series; confidence?: number[] };
    cciData?: { cci: Series; ma: Series };
    waveTrendData?: { wt1: Series; wt2: Series; crosses?: { time: string | number; cross: 1 | -1 }[]; wt1Confidence?: number[]; wt2Confidence?: number[] };
    macdData?: { macd: Series; signal: Series; histogram: (Series[number] & { color?: string })[] };
    stochRsiData?: { k: Series; d: Series };
    dmiData?: { plusDI: Series; minusDI: Series; adx: Series };
    smiData?: { smi: Series; signal: Series; histogram?: (Series[number] & { color?: string })[] };
    aoData?: Series;
    mfiData?: { mfi: Series };
    wprData?: Series;
    diData?: Series;
    cmfData?: Series;
    adData?: { ad: Series; ma: Series };
    nvData?: Series;
    madrData?: Series;
    almaData?: Series;
    bbData?: { time: string | number; basis?: number; upper?: number; lower?: number }[];
    regimeData?: { regime: MarketRegime }[];
}

export interface StrategyBacktestConfig {
    lookForward: number;
    interval?: string;
    mode?: StrategyMode;
    cooldownBars?: number;
    signalProfile?: SignalProfile;
    requireCrossover?: boolean;
    signalMask?: Uint8Array;
    debugLog?: boolean;
    evaluationMode?: EvaluationMode;
    riskConfig?: TradeRiskConfig;
    portfolioConfig?: PortfolioSimConfig;
}

export interface StrategyBacktestResult {
    winRate: number;
    totalSignals: number;
    wins: number;
    history: BacktestHistoryItem[];
    profitFactor: number;
    sharpeRatio: number;
    avgWin: number;
    avgLoss: number;
    maxDrawdown: number;
    totalReturn: number;
    regimeBreakdown: Record<MarketRegime, RegimeStats>;
    log?: BacktestLogEntry[];
    evaluationMode?: EvaluationMode;
    avgMFE?: number;
    avgMAE?: number;
    avgBarsHeld?: number;
    exitReasonBreakdown?: Record<string, number>;
    portfolioResult?: PortfolioSimResult;
    equityCurve?: { time: string | number; equity: number }[];
    drawdownCurve?: { time: string | number; drawdownPct: number }[];
    finalEquity?: number;
    cagr?: number;
    maxDrawdownPct?: number;
    psr?: number;
    averageReturnPerBar?: number;
    opportunityEfficiency?: number;
}

export interface StrategyOptimizationConfig {
    indicators: string[];
    lookForwardRange?: [number, number];
    paramRanges?: Record<string, [number, number]>;
    convergenceRounds?: number;
    interval?: string;
    mode?: StrategyMode;
    strategyName?: string;
}

export interface RoundResult { param: string; value: number; winRate: number }

export interface StrategyOptimizationResult {
    bestParams: Record<string, number>;
    bestWinRate: number;
    iterations: number;
    roundResults: RoundResult[];
}

export interface DiscoveredStrategy {
    indicators: string[];
    params: Record<string, number>;
    winRate: number;
    totalSignals: number;
    rank: number;
    validatedWinRate?: number;
    profitFactor?: number;
    sharpeRatio?: number;
    avgWin?: number;
    avgLoss?: number;
    maxDrawdown?: number;
    totalReturn?: number;
    regimeBreakdown?: Record<MarketRegime, RegimeStats>;
}

export interface DiscoveryResult {
    best: DiscoveredStrategy;
    all: DiscoveredStrategy[];
    totalCombinationsTested: number;
    poolSize: number;
}

export interface ProfileConfig {
    tradeThreshold: number;
    baseCooldown: number;
    gamma: number;
    cooldownMin: number;
    cooldownMax: number;
    requireCrossover: boolean;
    volatilityLookback: number;
    stopLossAtrMult: number;
    takeProfitR: number;
    useTrailingStop: boolean;
    trailAtrMult: number;
    transactionCostPct?: number;
}
