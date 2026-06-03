// lib/ta/strategy-portfolio.ts — Strategy Portfolio + Regime-Adaptive Execution
// Builds a portfolio of 3-5 low-correlation strategies, profiles them by market regime,
// and generates aggregate signals with EMA smoothing + RegimeSwitchGuard.

import type { Candle } from './backtest';
import type {
    MarketRegime,
    RegimeStats,
    StrategyMode,
    BBA,
} from './types';
import type {
    AllData,
    DiscoveredStrategy,
    StrategyBacktestResult,
} from './strategy-optimizer';
import {
    detectRegime,
    runStrategyBacktest,
} from './strategy-optimizer';
import {
    signalToBBA,
    fuseAll,
} from './signal-registry';

// ─── Portfolio Types ───────────────────────────────────────────────────────────

/** A strategy's performance in a specific market regime */
export interface RegimePerformance {
    regime: MarketRegime;
    score: number;              // Weighted composite score for this regime
    winRate: number;
    profitFactor: number;
    sharpeRatio: number;
    totalSignals: number;
    confidence: number;         // 0-1, based on signal count (more signals = higher confidence)
}

/** A strategy within the portfolio */
export interface PortfolioStrategy {
    id: string;
    indicators: string[];
    params: Record<string, number>;
    mode: StrategyMode;

    // Overall metrics
    overallWinRate: number;
    overallSharpe: number;
    overallProfitFactor: number;

    // Regime-specific performance
    regimePerformance: RegimePerformance[];

    // Pairwise signal correlation with other portfolio members
    correlationWithOthers: Record<string, number>;    // strategyId → correlation (0-1)
}

/** The complete strategy portfolio */
export interface StrategyPortfolio {
    strategies: PortfolioStrategy[];
    selectedRegime: MarketRegime;
    regimeStrategyWeights: Record<MarketRegime, string[]>;    // regime → ordered strategy IDs
    createdAt: Date;
    symbol: string;
    interval: string;
}

/** Options for building a portfolio */
export interface PortfolioBuildOptions {
    symbol: string;
    interval: string;
    minRegimeSignals: number;       // Minimum signals in a regime to include (default: 5)
    maxPortfolioSize: number;       // Maximum strategies in portfolio (default: 5)
    correlationThreshold: number;   // Max allowed correlation (default: 0.70)
    regimeConfidenceMin: number;    // Min regime confidence to consider (default: 0.3)
}

/** Options for aggregate signal generation */
export interface AggregateSignalOptions {
    smoothingAlpha: number;         // EMA smoothing factor (default: 0.15)
    switchGuardMin: number;         // RegimeSwitchGuard consecutive confirmations (default: 3)
    minRegimeWeight: number;        // Minimum weight for any strategy in blend (default: 0.10)
    regimeConfidenceWindow: number; // Bars to look back for regime detection (default: 30)
}

/** Aggregate signal result */
export interface AggregateSignalResult {
    signal: 'BUY' | 'SELL' | 'NEUTRAL';
    buyConfidence: number;          // 0-1
    sellConfidence: number;         // 0-1
    uncertainty: number;            // 0-1
    regime: MarketRegime;
    regimeConfidence: number;       // How confident we are in regime classification
    weights: Record<string, number>;  // strategyId → weight
    smoothedSignal: number;         // -1 (sell) to +1 (buy), EMA-smoothed
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ALL_REGIMES: MarketRegime[] = ['uptrend', 'downtrend', 'ranging', 'volatile', 'neutral'];

const DEFAULT_BUILD_OPTIONS: PortfolioBuildOptions = {
    symbol: '',
    interval: '4h',
    minRegimeSignals: 5,
    maxPortfolioSize: 5,
    correlationThreshold: 0.70,
    regimeConfidenceMin: 0.3,
};

// Lazy-imported timeframe guard (avoid circular dependency at module level)
let _tfGuard: typeof import('./timeframe-guard') | null = null;
function getTfGuard() {
    if (!_tfGuard) _tfGuard = require('./timeframe-guard');
    return _tfGuard;
}

/** Validate that a given interval is allowed. Throws if not. */
function assertPortfolioInterval(interval: string, context: string): string {
    const guard = getTfGuard();
    if (!guard) throw new Error('[strategy-portfolio] Timeframe guard not loaded');
    return guard.assertAllowedTimeframe(interval, `strategy-portfolio.${context}`);
}

const DEFAULT_AGGREGATE_OPTIONS: AggregateSignalOptions = {
    smoothingAlpha: 0.15,
    switchGuardMin: 3,
    minRegimeWeight: 0.10,
    regimeConfidenceWindow: 30,
};

// ─── Helper: Composite Score per Regime ────────────────────────────────────────

/**
 * Compute a composite score for a strategy given its regime stats.
 * score = winRate * 0.5 + win/loss ratio * 0.3 + signal coverage * 0.2
 */
function regimeCompositeScore(stats: RegimeStats, maxSignals: number): number {
    const wr = stats.winRate / 100;     // Normalize to 0-1
    const winLossRatio = stats.wins > 0 && stats.wins < stats.totalSignals
        ? stats.wins / (stats.totalSignals - stats.wins)
        : stats.wins > 0 ? 3 : 0;
    const signalCoverage = maxSignals > 0
        ? Math.min(1, stats.totalSignals / maxSignals)
        : 0;

    return (wr * 0.5 + Math.min(winLossRatio, 3) * 0.3 + signalCoverage * 0.2);
}

// ─── 1. Regime Performance Matrix ──────────────────────────────────────────────

/**
 * Compute the regime performance breakdown for a set of candidate strategies.
 * For each strategy, runs backtest and groups results by detected market regime.
 *
 * @param candles    - Full OHLCV sequence
 * @param allData    - Pre-computed indicator data
 * @param candidates - Candidate strategies from Hyperband/MCTS pipeline
 * @param options    - Portfolio build options
 * @returns Map of strategy identifier → RegimePerformance[]
 */
export function computeRegimeMatrix(
    candles: Candle[],
    allData: AllData,
    candidates: DiscoveredStrategy[],
    options?: Partial<PortfolioBuildOptions>
): Map<string, RegimePerformance[]> {
    const opts = { ...DEFAULT_BUILD_OPTIONS, ...options };
    assertPortfolioInterval(opts.interval, 'computeRegimeMatrix');
    const regimeMap = new Map<string, RegimePerformance[]>();
    const lookForward = candidates.length > 0 && candidates[0].params?.lookForward
        ? Math.round(candidates[0].params.lookForward)
        : 14;

    for (const strategy of candidates) {
        const key = strategyId(strategy);

        // Run backtest with CUSTOM mode + customIndicators in options
        const result = runStrategyBacktest(
            candles,
            'CUSTOM',
            allData,
            { lookForward },
            {
                customIndicators: strategy.indicators,
                mode: (strategy as any).mode ?? 'majority',
            }
        );

        // Convert RegimeStats to RegimePerformance
        const regimeBreakdown = result.regimeBreakdown ?? {} as Record<MarketRegime, RegimeStats>;
        const maxSignals = Math.max(
            1,
            ...Object.values(regimeBreakdown).map(s => s.totalSignals)
        );

        const performances: RegimePerformance[] = [];
        for (const regime of ALL_REGIMES) {
            const stats = regimeBreakdown[regime];
            if (!stats || stats.totalSignals < opts.minRegimeSignals) continue;

            const score = regimeCompositeScore(stats, maxSignals);
            const confidence = Math.min(1, stats.totalSignals / 50);

            // Compute profit factor from available stats
            const pf = stats.totalSignals > 0 && stats.wins < stats.totalSignals
                ? (stats.wins * Math.abs(stats.avgReturn || 1)) /
                ((stats.totalSignals - stats.wins) * Math.abs(stats.avgReturn || 1) + 0.01)
                : stats.wins > 0 ? 999 : 0;

            performances.push({
                regime,
                score,
                winRate: stats.winRate,
                profitFactor: pf,
                sharpeRatio: estimateSharpe(stats),
                totalSignals: stats.totalSignals,
                confidence,
            });
        }

        regimeMap.set(key, performances);
    }

    return regimeMap;
}

// ─── 2. Signal Correlation Matrix ──────────────────────────────────────────────

/**
 * Compute pairwise signal correlation between two strategies.
 * Measures the proportion of time their signals agree (BUY/BUY, SELL/SELL, or both NEUTRAL).
 *
 * @param candles    - Full OHLCV sequence
 * @param allData    - Pre-computed indicator data
 * @param strategyA  - First strategy
 * @param strategyB  - Second strategy
 * @param lookForward - Look-forward bars for backtest
 * @returns Correlation coefficient 0-1 (1 = perfectly aligned)
 */
export function computeSignalCorrelation(
    candles: Candle[],
    allData: AllData,
    strategyA: DiscoveredStrategy,
    strategyB: DiscoveredStrategy,
    lookForward: number = 14
): number {
    const backtestA = runStrategyBacktest(
        candles, 'CUSTOM', allData,
        { lookForward },
        { customIndicators: strategyA.indicators, mode: (strategyA as any).mode ?? 'majority' }
    );
    const backtestB = runStrategyBacktest(
        candles, 'CUSTOM', allData,
        { lookForward },
        { customIndicators: strategyB.indicators, mode: (strategyB as any).mode ?? 'majority' }
    );

    const historyA = backtestA.history;
    const historyB = backtestB.history;

    // Align by index — compare signals at each candle
    const minLen = Math.min(historyA.length, historyB.length);
    if (minLen < 10) return 0.5;     // Not enough data, assume moderate correlation

    let agreements = 0;
    let total = 0;

    for (let i = 0; i < minLen; i++) {
        const sigA = historyA[i]?.signal;
        const sigB = historyB[i]?.signal;
        if (sigA === undefined || sigB === undefined) continue;

        // Both BUY, both SELL, or both neutral — counts as agreement
        if (sigA === sigB) agreements++;
        total++;
    }

    return total > 0 ? agreements / total : 0.5;
}

/**
 * Compute full correlation matrix for a set of strategies.
 *
 * @returns Record mapping "strategyA|strategyB" → correlation
 */
export function correlationMatrix(
    candles: Candle[],
    allData: AllData,
    strategies: DiscoveredStrategy[]
): Record<string, number> {
    const matrix: Record<string, number> = {};
    const lookForward = strategies.length > 0 && strategies[0].params?.lookForward
        ? Math.round(strategies[0].params.lookForward)
        : 14;

    for (let i = 0; i < strategies.length; i++) {
        for (let j = i + 1; j < strategies.length; j++) {
            const key = `${strategyId(strategies[i])}|${strategyId(strategies[j])}`;
            matrix[key] = computeSignalCorrelation(candles, allData, strategies[i], strategies[j], lookForward);
        }
    }

    return matrix;
}

// ─── 3. Build Portfolio ────────────────────────────────────────────────────────

/**
 * Build a strategy portfolio from top candidates.
 * Pipeline:
 *   1. Compute regime performance matrix for all candidates
 *   2. Compute pairwise signal correlations
 *   3. Greedy selection: pick top performer, then add low-correlation strategies
 *      that excel in different regimes
 *   4. Assign regime-specific strategy weights
 *
 * @param candles    - Full OHLCV sequence
 * @param allData    - Pre-computed indicator data
 * @param topStrategies - Top-K strategies from Hyperband pipeline
 * @param options    - Build options
 * @returns Constructed StrategyPortfolio
 */
export function buildPortfolio(
    candles: Candle[],
    allData: AllData,
    topStrategies: DiscoveredStrategy[],
    options?: Partial<PortfolioBuildOptions>
): StrategyPortfolio {
    const opts = { ...DEFAULT_BUILD_OPTIONS, ...options };
    assertPortfolioInterval(opts.interval, 'buildPortfolio');

    // Empty regime weights for invalid portfolio
    const emptyWeights: Record<MarketRegime, string[]> = {
        uptrend: [], downtrend: [], ranging: [], volatile: [], neutral: [],
    };

    if (topStrategies.length === 0) {
        return {
            strategies: [],
            selectedRegime: 'neutral',
            regimeStrategyWeights: emptyWeights,
            createdAt: new Date(),
            symbol: opts.symbol,
            interval: opts.interval,
        };
    }

    // Step 1: Compute regime matrix
    const regimeMap = computeRegimeMatrix(candles, allData, topStrategies, options);

    // Step 2: Score candidates by overall composite
    interface ScoredCandidate {
        strategy: DiscoveredStrategy;
        compositeScore: number;
        regimeScores: Map<MarketRegime, number>;
    }

    const scored = topStrategies.map(s => {
        const perf = regimeMap.get(strategyId(s)) ?? [];
        const overallScore = perf.reduce((sum, p) => sum + p.score * p.confidence, 0);
        const regimeScores = new Map<MarketRegime, number>();
        for (const p of perf) {
            regimeScores.set(p.regime, p.score);
        }
        return { strategy: s, compositeScore: overallScore, regimeScores };
    });

    scored.sort((a, b) => b.compositeScore - a.compositeScore);

    // Step 3: Greedy selection — pick best overall, then add diverse strategies
    const selected: ScoredCandidate[] = [];
    const usedRegimes = new Set<MarketRegime>();

    // Always pick the top overall performer
    selected.push(scored[0]);
    // Track which regimes it covers well
    for (const [regime, score] of scored[0].regimeScores) {
        if (score > opts.regimeConfidenceMin) usedRegimes.add(regime);
    }

    // Compute correlation for remaining candidates against selected set
    const candidates = scored.slice(1);
    const lookForward = topStrategies.length > 0 && topStrategies[0].params?.lookForward
        ? Math.round(topStrategies[0].params.lookForward)
        : 14;

    for (const candidate of candidates) {
        if (selected.length >= opts.maxPortfolioSize) break;

        const candStrat = candidate.strategy;

        // Check correlation with already selected strategies
        let maxCorrelation = 0;
        for (const sel of selected) {
            const corr = computeSignalCorrelation(candles, allData, sel.strategy, candStrat, lookForward);
            maxCorrelation = Math.max(maxCorrelation, corr);
        }

        if (maxCorrelation > opts.correlationThreshold) continue;

        // Check if it covers a regime not already well-covered
        let coversNewRegime = false;
        for (const [regime, score] of candidate.regimeScores) {
            if (!usedRegimes.has(regime) && score > opts.regimeConfidenceMin) {
                coversNewRegime = true;
                usedRegimes.add(regime);
            }
        }

        if (coversNewRegime || selected.length < 3) {
            selected.push(candidate);
        }
    }

    // Step 4: Build PortfolioStrategy objects
    const portfolioStrategies: PortfolioStrategy[] = [];
    const idMap = new Map<string, PortfolioStrategy>();

    for (const sel of selected) {
        const id = strategyId(sel.strategy);
        const perf = regimeMap.get(id) ?? [];
        const overallWinRate = sel.strategy.winRate;
        const overallSharpe = sel.strategy.sharpeRatio ?? 0;
        const overallProfitFactor = sel.strategy.profitFactor ?? 0;

        const ps: PortfolioStrategy = {
            id,
            indicators: [...sel.strategy.indicators],
            params: { ...sel.strategy.params },
            mode: (sel.strategy as any).mode ?? 'majority',
            overallWinRate,
            overallSharpe,
            overallProfitFactor,
            regimePerformance: perf,
            correlationWithOthers: {},
        };

        portfolioStrategies.push(ps);
        idMap.set(id, ps);
    }

    // Fill in correlation matrix between portfolio members
    for (let i = 0; i < portfolioStrategies.length; i++) {
        for (let j = i + 1; j < portfolioStrategies.length; j++) {
            const a = portfolioStrategies[i];
            const b = portfolioStrategies[j];
            const corr = computeSignalCorrelation(
                candles, allData,
                selected[i].strategy, selected[j].strategy,
                lookForward
            );
            a.correlationWithOthers[b.id] = corr;
            b.correlationWithOthers[a.id] = corr;
        }
    }

    // Step 5: Build regime strategy weights
    const regimeStrategyWeights: Record<MarketRegime, string[]> = {
        uptrend: [],
        downtrend: [],
        ranging: [],
        volatile: [],
        neutral: [],
    };

    for (const regime of ALL_REGIMES) {
        // Rank strategies by their score in this regime
        const ranked = portfolioStrategies
            .map(ps => ({
                id: ps.id,
                regimeScore: ps.regimePerformance.find(p => p.regime === regime)?.score ?? 0,
            }))
            .filter(x => x.regimeScore > 0)
            .sort((a, b) => b.regimeScore - a.regimeScore);

        regimeStrategyWeights[regime] = ranked.map(r => r.id);
    }

    // Step 6: Detect current regime from most recent candles
    const currentRegime = detectCurrentRegime(candles);

    return {
        strategies: portfolioStrategies,
        selectedRegime: currentRegime,
        regimeStrategyWeights,
        createdAt: new Date(),
        symbol: opts.symbol,
        interval: opts.interval,
    };
}

// ─── 4. Select Strategies for Regime ───────────────────────────────────────────

/**
 * Select the best strategies for the current market regime.
 * Returns top-N strategies ordered by regime-specific composite score.
 *
 * @param portfolio - The strategy portfolio
 * @param regime    - Current detected market regime
 * @param topN      - Number of strategies to select (default: 3)
 * @returns Ordered array of PortfolioStrategy
 */
export function selectStrategiesForRegime(
    portfolio: StrategyPortfolio,
    regime: MarketRegime,
    topN: number = 3
): PortfolioStrategy[] {
    const regimeIds = portfolio.regimeStrategyWeights[regime] ?? [];

    if (regimeIds.length === 0) {
        // Fallback: use overall best performers
        return [...portfolio.strategies]
            .sort((a, b) => b.overallWinRate - a.overallWinRate)
            .slice(0, topN);
    }

    // Map IDs to strategy objects, ordered by regime score
    const strategyMap = new Map(portfolio.strategies.map(s => [s.id, s]));
    const selected: PortfolioStrategy[] = [];

    for (const id of regimeIds) {
        if (selected.length >= topN) break;
        const strategy = strategyMap.get(id);
        if (strategy) selected.push(strategy);
    }

    // Fill remaining slots with highest overall performers not yet selected
    if (selected.length < topN) {
        const selectedIds = new Set(selected.map(s => s.id));
        const remaining = portfolio.strategies
            .filter(s => !selectedIds.has(s.id))
            .sort((a, b) => b.overallWinRate - a.overallWinRate);

        for (const s of remaining) {
            if (selected.length >= topN) break;
            selected.push(s);
        }
    }

    return selected;
}

// ─── 5. Compute Regime-Adaptive Weights ────────────────────────────────────────

/**
 * Compute DST-fusion weights for strategies based on current regime.
 * Uses Dempster-Shafer Theory to combine:
 *   - Regime confidence evidence
 *   - Strategy performance in that regime
 *   - Strategy correlation penalties
 *
 * @param portfolio - The strategy portfolio
 * @param regime    - Current detected regime
 * @param regimeConfidence - Confidence in regime classification (0-1)
 * @returns Strategy weights (strategyId → weight, summing to 1)
 */
export function computeWeights(
    portfolio: StrategyPortfolio,
    regime: MarketRegime,
    regimeConfidence: number = 0.7
): Record<string, number> {
    const selected = selectStrategiesForRegime(portfolio, regime, portfolio.strategies.length);
    if (selected.length === 0) return {};

    // Step 1: Compute raw weight from regime performance
    const rawWeights = new Map<string, number>();

    for (const strategy of selected) {
        const regimePerf = strategy.regimePerformance.find(p => p.regime === regime);

        if (!regimePerf || regimePerf.totalSignals === 0) {
            // Fallback: use overall win rate with penalty
            rawWeights.set(strategy.id, strategy.overallWinRate * 0.5);
            continue;
        }

        // DST-inspired weight: combine regime confidence with strategy evidence
        // weight = regimeConfidence × regimeScore + (1 - regimeConfidence) × overallScore
        const overallScore = strategy.overallWinRate * 0.4
            + Math.min(strategy.overallSharpe, 3) * 0.3
            + Math.min(strategy.overallProfitFactor, 10) * 0.3;
        const regimeScore = regimePerf.score;

        const weight = regimeConfidence * regimeScore + (1 - regimeConfidence) * overallScore;
        rawWeights.set(strategy.id, Math.max(0, weight));
    }

    // Step 2: Apply correlation penalty
    // Strategies highly correlated with others get a diversity discount
    const adjustedWeights = new Map<string, number>();

    for (const strategy of selected) {
        let raw = rawWeights.get(strategy.id) ?? 0;

        // Compute average correlation with other selected strategies
        let sumCorr = 0;
        let corrCount = 0;
        for (const other of selected) {
            if (other.id === strategy.id) continue;
            const corr = strategy.correlationWithOthers[other.id];
            if (corr !== undefined) {
                sumCorr += corr;
                corrCount++;
            }
        }
        const avgCorr = corrCount > 0 ? sumCorr / corrCount : 0;

        // Diversity discount: penalty proportional to correlation
        // At corr=0: no penalty. At corr=0.7: 20% penalty. At corr=1.0: 50% penalty.
        const diversityPenalty = avgCorr > 0 ? 1 - (avgCorr * 0.5) : 1;
        adjustedWeights.set(strategy.id, raw * diversityPenalty);
    }

    // Step 3: Normalize to sum = 1
    let totalWeight = 0;
    for (const w of adjustedWeights.values()) totalWeight += w;

    const normalized: Record<string, number> = {};
    if (totalWeight > 0) {
        for (const [id, w] of adjustedWeights) {
            normalized[id] = w / totalWeight;
        }
    } else {
        // Equal weight fallback
        const eq = 1 / selected.length;
        for (const strategy of selected) {
            normalized[strategy.id] = eq;
        }
    }

    return normalized;
}

// ─── 6. Generate Aggregate Signal ──────────────────────────────────────────────

/**
 * Generate an aggregate trading signal from the portfolio.
 * Features:
 *   - DST Fusion: Combine strategy signals using Dempster-Shafer theory
 *   - Regime Weighting: Weight strategies by regime appropriateness
 *   - EMA Smoothing: Smooth the signal to avoid whipsaw transitions
 *   - RegimeSwitchGuard: Require N consecutive confirmations before regime switch
 *
 * @param portfolio      - The strategy portfolio
 * @param candles        - Recent OHLCV data for signal generation
 * @param allData        - Pre-computed indicator data
 * @param previousSignal - Previous smoothed signal value (-1 to +1) for EMA
 * @param previousRegime - Previously detected regime for switch guard
 * @param switchCounter  - Current consecutive regime confirmation count
 * @param options        - Aggregate signal options
 * @returns Aggregate signal result
 */
export function generateAggregateSignal(
    portfolio: StrategyPortfolio,
    candles: Candle[],
    allData: AllData,
    previousSignal: number = 0,
    previousRegime: MarketRegime = 'neutral',
    switchCounter: number = 0,
    options?: Partial<AggregateSignalOptions>
): AggregateSignalResult {
    const opts = { ...DEFAULT_AGGREGATE_OPTIONS, ...options };

    // Step 1: Detect current regime from recent bars
    const atrVals = computeATR(candles, 14);
    const lastIdx = candles.length - 1;
    const rawRegime = lastIdx >= 30 ? detectRegime(candles, lastIdx, atrVals) : 'neutral';

    // Step 2: RegimeSwitchGuard — confirm regime N consecutive times
    let confirmedRegime: MarketRegime;
    let regimeConfidence: number;
    let newSwitchCounter = switchCounter;

    if (rawRegime === previousRegime) {
        newSwitchCounter = Math.min(switchCounter + 1, 10);
        confirmedRegime = rawRegime;
        // Confidence increases with consecutive confirmations (max 0.95)
        regimeConfidence = Math.min(0.95, 0.5 + newSwitchCounter * 0.15);
    } else {
        newSwitchCounter = 0;
        // Don't switch immediately — use previous regime with lower confidence
        confirmedRegime = previousRegime;
        regimeConfidence = 0.4;     // Low confidence while observing
    }

    // If guard threshold reached, switch to new regime
    if (newSwitchCounter >= opts.switchGuardMin && rawRegime !== previousRegime) {
        confirmedRegime = rawRegime;
        regimeConfidence = 0.6;     // Starting confidence at switch
    }

    // Step 3: Compute strategy weights for confirmed regime
    const weights = computeWeights(portfolio, confirmedRegime, regimeConfidence);

    // Step 4: DST Fusion — combine strategy signals
    const bbaList: BBA[] = [];
    const lookForward = 14;     // Use default for signal generation

    for (const strategy of portfolio.strategies) {
        const weight = weights[strategy.id] ?? 0;
        if (weight < opts.minRegimeWeight) continue;

        // Run lightweight backtest to get current signal history
        const result = runStrategyBacktest(
            candles, 'CUSTOM', allData,
            { lookForward },
            {
                customIndicators: strategy.indicators,
                mode: strategy.mode,
            }
        );

        // Get the most recent signal from history
        const lastSignal = result.history.length > 0
            ? result.history[result.history.length - 1]?.signal
            : null;

        // Convert to BBA with weight as confidence
        const bba = signalToBBA(lastSignal, weight, confirmedRegime);
        // Scale the BBA by the strategy weight;
        // low-weight strategies contribute less to the fused result
        bbaList.push({
            buy: bba.buy * weight,
            sell: bba.sell * weight,
            uncertainty: bba.uncertainty * weight + (1 - weight),
        });
    }

    // Step 5: Fuse all BBAs
    const fused = bbaList.length > 0 ? fuseAll(bbaList) : { buy: 0, sell: 0, uncertainty: 1 };

    // Step 6: Compute raw signal (-1 to +1)
    const rawSignal = fused.buy - fused.sell;

    // Step 7: EMA smoothing
    // smoothed = alpha × raw + (1 - alpha) × previous
    const smoothedSignal = opts.smoothingAlpha * rawSignal + (1 - opts.smoothingAlpha) * previousSignal;

    // Step 8: Discretize to BUY/SELL/NEUTRAL with threshold
    const signalThreshold = 0.15;   // Minimum absolute value for a directional signal
    let signal: 'BUY' | 'SELL' | 'NEUTRAL';
    if (smoothedSignal > signalThreshold) {
        signal = 'BUY';
    } else if (smoothedSignal < -signalThreshold) {
        signal = 'SELL';
    } else {
        signal = 'NEUTRAL';
    }

    return {
        signal,
        buyConfidence: fused.buy,
        sellConfidence: fused.sell,
        uncertainty: fused.uncertainty,
        regime: confirmedRegime,
        regimeConfidence,
        weights,
        smoothedSignal,
    };
}

// ─── 7. Regime Detection Helper ────────────────────────────────────────────────

/**
 * Detect the current market regime from the most recent candles.
 * Uses EMA-weighted voting over the last N bars to smooth regime transitions.
 */
function detectCurrentRegime(candles: Candle[]): MarketRegime {
    const atrVals = computeATR(candles, 14);
    const window = 30;
    const startIdx = Math.max(30, candles.length - window);

    // Count regime occurrences with recency weight (EMA-like)
    const counts: Record<string, number> = {
        uptrend: 0,
        downtrend: 0,
        ranging: 0,
        volatile: 0,
        neutral: 0,
    };

    const alpha = 0.15; // Decay factor — recent bars count more

    for (let i = startIdx; i < candles.length; i++) {
        const regime = detectRegime(candles, i, atrVals);
        // Weight = exponential decay: most recent bar = 1, oldest = exp(-alpha * distance)
        const distance = candles.length - 1 - i;
        const weight = Math.exp(-alpha * distance);
        counts[regime] = (counts[regime] ?? 0) + weight;
    }

    // Find the regime with highest weighted count
    let bestRegime: MarketRegime = 'neutral';
    let bestCount = 0;
    for (const [regime, count] of Object.entries(counts)) {
        if (count > bestCount) {
            bestCount = count;
            bestRegime = regime as MarketRegime;
        }
    }

    return bestRegime;
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

/** Generate a deterministic ID for a strategy based on its (sorted) indicators */
function strategyId(strategy: DiscoveredStrategy): string {
    return [...strategy.indicators].sort().join('_');
}

/**
 * Compute ATR values for a candle array (Wilder's smoothed method).
 * Inlined locally to avoid circular dependencies.
 */
function computeATR(candles: Candle[], period: number = 14): number[] {
    if (candles.length < 2) return new Array(candles.length).fill(0);

    const tr = new Array<number>(candles.length);
    tr[0] = candles[0].high - candles[0].low;

    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;
        tr[i] = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
    }

    // Smoothed ATR (Wilder's method)
    const atr = new Array<number>(candles.length).fill(0);
    let sum = 0;
    for (let i = 0; i < period && i < candles.length; i++) {
        sum += tr[i];
        atr[i] = tr[i];
    }
    const validPeriod = Math.min(period, candles.length);
    atr[validPeriod - 1] = sum / validPeriod;

    for (let i = validPeriod; i < candles.length; i++) {
        atr[i] = (atr[i - 1] * (validPeriod - 1) + tr[i]) / validPeriod;
    }

    return atr;
}

/**
 * Estimate Sharpe ratio from regime stats (simplified).
 * Since we don't have per-trade return distribution, we approximate.
 */
function estimateSharpe(stats: RegimeStats): number {
    if (stats.totalSignals < 3) return 0;

    const winRate = stats.winRate / 100;    // Normalize to 0-1
    const avgReturnAbs = Math.abs(stats.avgReturn);

    // Approximate: if winRate > 0.5, positive Sharpe; else negative
    // Scale by avg return magnitude
    const baseSharpe = (winRate - 0.5) * 2;     // -1 to +1
    const returnScale = Math.min(1, avgReturnAbs * 10);  // 0-1

    return baseSharpe * returnScale;
}
