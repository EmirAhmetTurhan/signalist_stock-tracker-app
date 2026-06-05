// lib/ta/strategy-optimizer.ts — Strategy-level optimization & discovery engine
// Contains three pure functions: runStrategyBacktest, optimizeStrategyParams, discoverStrategy
// No React state — usable from server actions, Inngest jobs, and UI components.

import type { Candle } from './backtest';
import { geneticOptimize, localRefine, MIN_SIGNAL_THRESHOLD, MAX_INDICATORS } from './ga-optimizer';
import { INDICATOR_TO_ALLDATA_FIELD } from './indicator-all-data-map';
import { DISCOVERY_POOL } from './indicator-registry';
import {
    rsiSignal, cciSignal, waveTrendSignal, macdSignal,
    stochRsiSignal, dmiSignal, smiSignal, aoSignal,
    mfiSignal, wprSignal, diSignal, cmfSignal, adSignal,
    netvolSignal, madrSignal, almaSignal, bbSignal,
    rsiCross, cciCross, waveTrendCross, macdCross,
    stochRsiCross, dmiCross, smiCross, aoCross,
    mfiCross, wprCross, diCross, cmfCross, adCross,
    netvolCross, madrCross, almaCross, bbCross,
    type BBPoint,
    signalToBBA, fuseAll,
} from './signal-registry';
import type { StrategyMode, Timeframe, ComputedIndicators, MarketRegime, BBA, RegimeStats, SignalProfile, EvaluationMode } from './types';
import { simulateTrade, type TradeRiskConfig } from './trade-simulator';
import type { PortfolioSimConfig, PortfolioSimResult } from './portfolio-simulator';
import { OPTIMIZABLE_INDICATORS, rangeForTimeframe } from './optimizer';
import type { BacktestHistoryItem } from './backtest';
import { bayesianOptimize } from './bayesian-optimizer';
import type { BacktestLogEntry, IndicatorLogEntry, GateLogEntry } from './backtest-log';
import { assertAllowedTimeframe } from './timeframe-guard';

// ─── Type Definitions ────────────────────────────────────────────────────────

type Series = { time: string | number; value?: number }[];

/** Mirrors AllIndicatorData from StrategyBacktestMonitor.tsx */
export interface AllData {
    rsiData?: { rsi: Series; ma: Series; confidence?: number[] };
    cciData?: { cci: Series; ma: Series };
    waveTrendData?: {
        wt1: Series; wt2: Series;
        crosses?: { time: string | number; cross: 1 | -1 }[];
        /** SPRINT 1 / B4.1: Per-bar confidence flags — DST fusion tarafından tüketilir. */
        wt1Confidence?: number[];
        wt2Confidence?: number[];
    };
    macdData?: { macd: Series; signal: Series; histogram: (Series[number] & { color?: string })[] };
    stochRsiData?: { k: Series; d: Series };
    dmiData?: { plusDI: Series; minusDI: Series; adx: Series };
    smiData?: { smi: Series; signal: Series; histogram?: (Series[number] & { color?: string })[] };
    aoData?: Series;
    mfiData?: { mfi: Series };
    wprData?: Series;
    diData?: Series;
    cmfData?: Series;
    adData?: Series;
    nvData?: Series;
    madrData?: Series;
    almaData?: Series;
    bbData?: { time: string | number; basis?: number; upper?: number; lower?: number }[];
    /** Market regime data for each bar — populated during backtest for regime-aware logic */
    regimeData?: { regime: MarketRegime }[];
}

export interface StrategyBacktestConfig {
    lookForward: number;
    interval?: string;
    mode?: StrategyMode;
    cooldownBars?: number;
    /** Signal profile selection. If set, overrides individual tuning params.
     *  - Aggressive: TRADE_THRESHOLD=0.45, crossover optional, short cooldown
     *  - Balanced:   TRADE_THRESHOLD=0.55, crossover required, moderate cooldown
     *  - Conservative: TRADE_THRESHOLD=0.65, crossover required, long cooldown */
    signalProfile?: SignalProfile;
    /** When true (default), fresh crossover check is REQUIRED for a signal.
     *  When false, indicator values alone can trigger signals (no crossover needed).
     *  Useful for Aggressive mode where you want faster signal generation. */
    requireCrossover?: boolean;
    /** Stratified index mask for Hyperband low-fidelity evaluation.
     *  If set, only signal bars where mask[i] !== 0 will be counted
     *  toward Sharpe/WR/PF calculations. Indicator computation remains
     *  on the FULL candle sequence (path-dependent indicators intact).
     *
     *  WHY Uint8Array NOT Set<number>:
     *  - MCTS/DE hot-loops call this 1M+ times. Set.has(i) = ~35ns (hash + bucket).
     *  - Uint8Array[i] = ~2ns (direct memory read), zero GC, cache-friendly.
     *  - Pre-allocated in buffer pool, zero-allocation during hot-loop. */
    signalMask?: Uint8Array;
    /** When true, runStrategyBacktest will populate a detailed per-bar
     *  debug log showing indicator signals, DST fusion, gate checks,
     *  and rejection reasons. Useful for diagnosing why signals are
     *  being filtered out. */
    debugLog?: boolean;
    /** Evaluation mode for ground truth.
     *  - 'lookforward': Legacy 2-point comparison (default)
     *  - 'pathaware': Bar-by-bar trade simulation with SL/TP/trailing
     *  - 'regime': Path-aware + regime-dependent indicator confidence */
    evaluationMode?: EvaluationMode;
    /** Optional risk config override. If not set, derived from ProfileConfig. */
    riskConfig?: TradeRiskConfig;
    /** Portfolio simulation config. When set alongside evaluationMode='pathaware'|'regime',
     *  a full capital simulation is run after the backtest and attached to the result. */
    portfolioConfig?: PortfolioSimConfig;
}

export interface StrategyBacktestResult {
    winRate: number;
    totalSignals: number;
    wins: number;
    history: BacktestHistoryItem[];

    // ─── Multi-Metric Performance (Phase 2b+) ───
    profitFactor: number;        // Gross profit / gross loss
    sharpeRatio: number;         // Annualized Sharpe (daily returns, risk-free=0)
    avgWin: number;              // Average winning trade return %
    avgLoss: number;             // Average losing trade return %
    maxDrawdown: number;         // Maximum peak-to-trough drawdown %
    totalReturn: number;         // Net total return %

    // ─── Regime-Based Breakdown (Phase 3) ───
    regimeBreakdown: Record<MarketRegime, RegimeStats>;

    /** Debug log entries populated only when config.debugLog=true.
     *  Contains per-bar indicator signals, DST fusion, gate checks,
     *  and rejection reasons for transparency. */
    log?: BacktestLogEntry[];

    // ─── Path-Aware Metrics (populated when evaluationMode != 'lookforward') ───
    /** Evaluation mode used for this backtest run */
    evaluationMode?: EvaluationMode;
    /** Average Maximum Favorable Excursion across all trades (%) */
    avgMFE?: number;
    /** Average Maximum Adverse Excursion across all trades (%) */
    avgMAE?: number;
    /** Average bars held per trade */
    avgBarsHeld?: number;
    /** Distribution of exit reasons */
    exitReasonBreakdown?: Record<string, number>;

    // ─── Portfolio Simulation (populated when portfolioConfig is provided) ───
    /** Full portfolio simulation result */
    portfolioResult?: PortfolioSimResult;
    /** Resampled equity curve (100-200 points, safe for serialization) */
    equityCurve?: { time: string | number; equity: number }[];
    /** Resampled drawdown curve */
    drawdownCurve?: { time: string | number; drawdownPct: number }[];
    /** Final portfolio equity value */
    finalEquity?: number;
    /** Compound annual growth rate (%) */
    cagr?: number;
    /** Maximum drawdown from portfolio simulation (%) */
    maxDrawdownPct?: number;
}

export interface StrategyOptimizationConfig {
    indicators: string[];
    lookForwardRange?: [number, number];
    paramRanges?: Record<string, [number, number]>;
    convergenceRounds?: number;
    interval?: string;
    mode?: StrategyMode;
}

export interface RoundResult {
    param: string;
    value: number;
    winRate: number;
}

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

    // ─── Multi-Metric (Phase 2b+) ───
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Map ComputedIndicators → AllData (compatible with StrategyBacktestMonitor) */
export function mapComputedToAllData(computed: ComputedIndicators): AllData {
    return {
        // SPRINT 1 / B4.2: RSI confidence pass-through — warmup/fallback barları DST'de sıfır güç alacak
        rsiData: computed.rsi
            ? { rsi: computed.rsi.rsi, ma: computed.rsi.ma, confidence: computed.rsi.confidence }
            : undefined,
        cciData: computed.cci ? { cci: computed.cci.cci, ma: computed.cci.ma } : undefined,
        // SPRINT 1 / B4.2: WaveTrend wt1/wt2 confidence pass-through
        waveTrendData: computed.wavetrend
            ? {
                wt1: computed.wavetrend.wt1,
                wt2: computed.wavetrend.wt2,
                crosses: computed.wavetrend.crosses,
                wt1Confidence: computed.wavetrend.wt1Confidence,
                wt2Confidence: computed.wavetrend.wt2Confidence,
            }
            : undefined,
        macdData: computed.macd
            ? { macd: computed.macd.macd, signal: computed.macd.signal, histogram: computed.macd.histogram }
            : undefined,
        stochRsiData: computed.stochrsi ? { k: computed.stochrsi.k, d: computed.stochrsi.d } : undefined,
        dmiData: computed.dmi
            ? { plusDI: computed.dmi.plusDI, minusDI: computed.dmi.minusDI, adx: computed.dmi.adx }
            : undefined,
        smiData: computed.smi ? { smi: computed.smi.smi, signal: computed.smi.signal } : undefined,
        aoData: computed.ao,
        mfiData: computed.mfi ? { mfi: computed.mfi.mfi } : undefined,
        wprData: computed.wpr,
        diData: computed.di,
        cmfData: computed.cmf,
        adData: computed.ad,
        nvData: computed.netvol,
        madrData: computed.madr,
        almaData: computed.alma,
        bbData: computed.bb as unknown as AllData['bbData'],
    };
}


/** Generate all C(n,k) combinations of an array */
function combinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const [first, ...rest] = arr;
    const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = combinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

// ─── Per-bar signal calculator (mirrors getIndicatorSignal from StrategyBacktestMonitor) ──

function getIndicatorSignal(
    key: string,
    i: number,
    data: AllData,
    candles?: Candle[]
): "BUY" | "SELL" | null {
    switch (key) {
        case "rsi": {
            if (!data.rsiData) return null;
            // SPRINT 1 / B4.2: Confidence gate — warmup/fallback barları oylamaya katılmaz
            if (data.rsiData.confidence && data.rsiData.confidence[i] === 0) return null;
            const rsi = data.rsiData.rsi[i]?.value;
            const rsiMa = data.rsiData.ma[i]?.value;
            if (rsi === undefined || rsiMa === undefined) return null;
            return rsiSignal(rsi, rsiMa);
        }
        case "cci": {
            if (!data.cciData) return null;
            const cci = data.cciData.cci[i]?.value;
            const ma = data.cciData.ma[i]?.value;
            if (cci === undefined || ma === undefined) return null;
            return cciSignal(cci, ma);
        }
        case "wavetrend": {
            if (!data.waveTrendData) return null;
            // SPRINT 1 / B4.2: wt1 ve wt2'nin ikisi de confidence=1 olmalı
            const w1Conf = data.waveTrendData.wt1Confidence?.[i];
            const w2Conf = data.waveTrendData.wt2Confidence?.[i];
            if (w1Conf === 0 || w2Conf === 0) return null;
            const wt1 = data.waveTrendData.wt1[i]?.value;
            const wt2 = data.waveTrendData.wt2[i]?.value;
            if (wt1 === undefined || wt2 === undefined) return null;
            return waveTrendSignal(wt1, wt2);
        }
        case "macd": {
            if (!data.macdData) return null;
            const macd = data.macdData.macd[i]?.value;
            const signal = data.macdData.signal[i]?.value;
            if (macd === undefined || signal === undefined) return null;
            return macdSignal(macd, signal);
        }
        case "stochrsi": {
            if (!data.stochRsiData) return null;
            const k = data.stochRsiData.k[i]?.value;
            const d = data.stochRsiData.d[i]?.value;
            if (k === undefined || d === undefined) return null;
            return stochRsiSignal(k, d);
        }
        case "dmi": {
            if (!data.dmiData) return null;
            const plus = data.dmiData.plusDI[i]?.value;
            const minus = data.dmiData.minusDI[i]?.value;
            if (plus === undefined || minus === undefined) return null;
            return dmiSignal(plus, minus);
        }
        case "smi": {
            if (!data.smiData) return null;
            const smi = data.smiData.smi[i]?.value;
            const signal = data.smiData.signal[i]?.value;
            if (smi === undefined || signal === undefined) return null;
            return smiSignal(smi, signal);
        }
        case "ao": {
            const arr = data.aoData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            return aoSignal(cur, prev);
        }
        case "mfi": {
            const arr = data.mfiData?.mfi ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            return mfiSignal(cur, prev);
        }
        case "wpr": {
            const arr = data.wprData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            return wprSignal(cur, prev);
        }
        case "di": {
            const arr = data.diData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return diSignal(cur);
        }
        case "cmf": {
            const arr = data.cmfData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return cmfSignal(cur);
        }
        case "ad": {
            const arr = data.adData ?? [];
            const cur = arr[i]?.value;
            const prev = arr[i - 1]?.value;
            if (cur === undefined || prev === undefined) return null;
            const slice = arr.slice(Math.max(0, i - 20), i + 1).map(p => p.value).filter((v): v is number => v !== undefined);
            if (slice.length < 2) return null;
            const sma = slice.reduce((a, b) => a + b, 0) / slice.length;
            return adSignal(cur, sma);
        }
        case "netvol": {
            const arr = data.nvData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return netvolSignal(cur);
        }
        case "madr": {
            const arr = data.madrData ?? [];
            const cur = arr[i]?.value;
            if (cur === undefined) return null;
            return madrSignal(cur);
        }
        case "alma": {
            const arr = data.almaData ?? [];
            const curA = arr[i]?.value;
            const prevA = arr[i - 1]?.value;
            const curC = candles?.[i]?.close;
            const prevC = candles?.[i - 1]?.close;
            if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) return null;
            return almaSignal(curA, prevA, curC, prevC);
        }
        case "bb": {
            const arr = data.bbData ?? [];
            const curBB = arr[i];
            const prevBB = arr[i - 1];
            const curC = candles?.[i]?.close;
            const prevC = candles?.[i - 1]?.close;
            if (!curBB || !prevBB || curC === undefined || prevC === undefined) return null;
            if (curBB.lower === undefined || prevBB.lower === undefined || curBB.upper === undefined || prevBB.upper === undefined) return null;
            return bbSignal(curBB as unknown as BBPoint, prevBB as unknown as BBPoint, curC, prevC);
        }
        default:
            return null;
    }
}

// ─── Per-bar crossover check (mirrors hasFreshCrossover from StrategyBacktestMonitor) ──

function hasFreshCrossover(
    key: string,
    i: number,
    data: AllData,
    candles?: Candle[]
): boolean {
    // Helper to check consecutive pair cross for simple (1-bar) indicators
    function checkConsecutiveWindow(
        check: (j: number) => boolean,
        minBars: number
    ): boolean {
        if (i < minBars) return false;
        for (let offset = 0; offset <= 6; offset++) {
            if (check(i - offset)) return true;
        }
        return false;
    }

    switch (key) {
        case "rsi": {
            if (!data.rsiData || i < 7) return false;
            const curRsi = data.rsiData.rsi[i]?.value;
            const curMa = data.rsiData.ma[i]?.value;
            if (curRsi === undefined || curMa === undefined) return false;
            // Check cross against bars i-1 through i-7
            for (let k = 1; k <= 7; k++) {
                const pkRsi = data.rsiData.rsi[i - k]?.value;
                const pkMa = data.rsiData.ma[i - k]?.value;
                if (pkRsi !== undefined && pkMa !== undefined && rsiCross(curRsi, curMa, pkRsi, pkMa)) return true;
            }
            return false;
        }
        case "cci": {
            if (!data.cciData || i < 7) return false;
            const curCci = data.cciData.cci[i]?.value;
            if (curCci === undefined) return false;
            for (let k = 1; k <= 7; k++) {
                const pkCci = data.cciData.cci[i - k]?.value;
                if (pkCci !== undefined && cciCross(curCci, pkCci)) return true;
            }
            return false;
        }
        case "wavetrend": {
            if (!data.waveTrendData || i < 7) return false;
            const cur1 = data.waveTrendData.wt1[i]?.value;
            const cur2 = data.waveTrendData.wt2[i]?.value;
            if (cur1 === undefined || cur2 === undefined) return false;
            for (let k = 1; k <= 7; k++) {
                const pkw1 = data.waveTrendData.wt1[i - k]?.value;
                const pkw2 = data.waveTrendData.wt2[i - k]?.value;
                if (pkw1 !== undefined && pkw2 !== undefined && waveTrendCross(cur1, cur2, pkw1, pkw2)) return true;
            }
            return false;
        }
        case "macd": {
            if (!data.macdData || i < 7) return false;
            // Check all consecutive pairs in [i-6..i] window
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curMacd = data.macdData.macd[j]?.value;
                const curSig = data.macdData.signal[j]?.value;
                const prevMacd = data.macdData.macd[j - 1]?.value;
                const prevSig = data.macdData.signal[j - 1]?.value;
                if ([curMacd, curSig, prevMacd, prevSig].some(v => v === undefined)) continue;
                if (macdCross(curMacd!, curSig!, prevMacd!, prevSig!)) return true;
            }
            return false;
        }
        case "stochrsi": {
            if (!data.stochRsiData || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curK = data.stochRsiData.k[j]?.value;
                const curD = data.stochRsiData.d[j]?.value;
                const prevK = data.stochRsiData.k[j - 1]?.value;
                const prevD = data.stochRsiData.d[j - 1]?.value;
                if ([curK, curD, prevK, prevD].some(v => v === undefined)) continue;
                if (stochRsiCross(curK!, curD!, prevK!, prevD!)) return true;
            }
            return false;
        }
        case "dmi": {
            if (!data.dmiData || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curP = data.dmiData.plusDI[j]?.value;
                const curM = data.dmiData.minusDI[j]?.value;
                const prevP = data.dmiData.plusDI[j - 1]?.value;
                const prevM = data.dmiData.minusDI[j - 1]?.value;
                if ([curP, curM, prevP, prevM].some(v => v === undefined)) continue;
                if (dmiCross(curP!, curM!, prevP!, prevM!)) return true;
            }
            return false;
        }
        case "smi": {
            if (!data.smiData || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curSmi = data.smiData.smi[j]?.value;
                const curSig = data.smiData.signal[j]?.value;
                const prevSmi = data.smiData.smi[j - 1]?.value;
                const prevSig = data.smiData.signal[j - 1]?.value;
                if ([curSmi, curSig, prevSmi, prevSig].some(v => v === undefined)) continue;
                if (smiCross(curSmi!, curSig!, prevSmi!, prevSig!)) return true;
            }
            return false;
        }
        case "ao": {
            const arr = data.aoData ?? [];
            if (i < 7) return false;
            const cur = arr[i]?.value;
            if (cur === undefined) return false;
            for (let k = 1; k <= 7; k++) {
                const pk = arr[i - k]?.value;
                if (pk !== undefined && aoCross(cur, pk)) return true;
            }
            return false;
        }
        case "mfi": {
            if (!data.mfiData || i < 7) return false;
            const arr = data.mfiData.mfi;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (mfiCross(cur, prev)) return true;
            }
            return false;
        }
        case "wpr": {
            const arr = data.wprData ?? [];
            if (i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (wprCross(cur, prev)) return true;
            }
            return false;
        }
        case "di": {
            const arr = data.diData ?? [];
            if (i < 7) return false;
            const cur = arr[i]?.value;
            if (cur === undefined) return false;
            for (let k = 1; k <= 7; k++) {
                const pk = arr[i - k]?.value;
                if (pk !== undefined && diCross(cur, pk)) return true;
            }
            return false;
        }
        case "cmf": {
            const arr = data.cmfData ?? [];
            if (i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (cmfCross(cur, prev)) return true;
            }
            return false;
        }
        case "ad": {
            const arr = data.adData ?? [];
            if (i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                const sliceCur = arr.slice(Math.max(0, j - 20), j + 1).map(p => p.value).filter((v): v is number => v !== undefined);
                const slicePrev = arr.slice(Math.max(0, j - 21), j).map(p => p.value).filter((v): v is number => v !== undefined);
                if (sliceCur.length < 2 || slicePrev.length < 2) continue;
                const smaCur = sliceCur.reduce((a, b) => a + b, 0) / sliceCur.length;
                const smaPrev = slicePrev.reduce((a, b) => a + b, 0) / slicePrev.length;
                if (adCross(cur, prev, smaCur, smaPrev)) return true;
            }
            return false;
        }
        case "netvol": {
            const arr = data.nvData ?? [];
            if (i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (netvolCross(cur, prev)) return true;
            }
            return false;
        }
        case "madr": {
            const arr = data.madrData ?? [];
            if (i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const cur = arr[j]?.value;
                const prev = arr[j - 1]?.value;
                if (cur === undefined || prev === undefined) continue;
                if (madrCross(cur, prev)) return true;
            }
            return false;
        }
        case "alma": {
            const arr = data.almaData ?? [];
            if (!candles || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curA = arr[j]?.value;
                const prevA = arr[j - 1]?.value;
                const curC = candles[j]?.close;
                const prevC = candles[j - 1]?.close;
                if (curA === undefined || prevA === undefined || curC === undefined || prevC === undefined) continue;
                if (almaCross(curA, prevA, curC, prevC)) return true;
            }
            return false;
        }
        case "bb": {
            const arr = data.bbData ?? [];
            if (!candles || i < 7) return false;
            for (let j = i; j >= i - 6; j--) {
                if (j < 1) break;
                const curBB = arr[j];
                const prevBB = arr[j - 1];
                const curC = candles[j]?.close;
                const prevC = candles[j - 1]?.close;
                if (!curBB || !prevBB || curC === undefined || prevC === undefined) continue;
                if (curBB.lower === undefined || prevBB.lower === undefined || curBB.upper === undefined || prevBB.upper === undefined) continue;
                if (bbCross(curBB as unknown as BBPoint, prevBB as unknown as BBPoint, curC, prevC)) return true;
            }
            return false;
        }
        default:
            return false;
    }
}

// ─── ATR, Dynamic Cooldown & Market Regime Detection ────────────────────────

/**
 * Pre-compute Wilder's Smoothing ATR for all bars.
 * O(n) time, O(n) memory — called once per backtest run.
 */
function computeATR(candles: Candle[], period: number = 14): number[] {
    const atr: number[] = [];
    if (candles.length === 0) return atr;

    let sumTR = 0;
    for (let i = 0; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));

        if (i < period) {
            sumTR += tr;
            atr.push(sumTR / (i + 1)); // Simple mean during warmup
        } else if (i === period) {
            sumTR += tr;
            atr.push(sumTR / period); // First real ATR value
        } else {
            // Wilder's smoothing: ATR = ((prevATR * (period-1)) + TR) / period
            atr.push((atr[i - 1] * (period - 1) + tr) / period);
        }
    }
    return atr;
}

// ─── Signal Profile Configuration ──────────────────────────────────────────

export interface ProfileConfig {
    tradeThreshold: number;
    baseCooldown: number;
    gamma: number;
    cooldownMin: number;
    cooldownMax: number;
    requireCrossover: boolean;
    /** Lookback period for ATR volatility baseline (bars) */
    volatilityLookback: number;
    // ─── Path-Aware Trade Risk Parameters ───
    /** Stop-loss distance in ATR multiples */
    stopLossAtrMult: number;
    /** Take-profit as reward:risk ratio (TP = stop distance × R) */
    takeProfitR: number;
    /** Whether trailing stop is active */
    useTrailingStop: boolean;
    /** Trailing stop distance in ATR multiples from peak */
    trailAtrMult: number;
}

/**
 * Profile configuration map.
 * Each profile defines:
 * - tradeThreshold: DST fusion threshold (lower = more signals)
 *   - Aggressive: 0.15 → düşük eşik, çok sinyal (swing trade için erken giriş)
 *   - Balanced:   0.40 → orta eşik
 *   - Conservative: 0.65 → yüksek eşik, az-öz sinyal (swing trade için yüksek güven)
 * - baseCooldown: base cooldown in bars (adjusted by volatility)
 * - gamma: volatility sensitivity (higher = more responsive to volatility changes)
 * - cooldownMin/Max: clamp range
 * - requireCrossover: whether fresh crossover is mandatory
 * - volatilityLookback: window for ATR baseline (lower = more responsive)
 */
export const PROFILE_CONFIGS: Record<SignalProfile, ProfileConfig> = {
    Aggressive: {
        tradeThreshold: 0.15, // FIX (Sprint 1 / B1): 0.45 → 0.15 — düşük eşik, daha fazla sinyal
        baseCooldown: 3,
        gamma: 1.0,
        cooldownMin: 1,
        cooldownMax: 8,
        requireCrossover: false,
        volatilityLookback: 30,
        stopLossAtrMult: 1.5,
        takeProfitR: 1.5,
        useTrailingStop: true,
        trailAtrMult: 0.5,
    },
    Balanced: {
        tradeThreshold: 0.40, // FIX (Sprint 1 / B1): 0.55 → 0.40 — orta eşik
        baseCooldown: 5,
        gamma: 0.7,
        cooldownMin: 2,
        cooldownMax: 14,
        requireCrossover: true,
        volatilityLookback: 30,
        stopLossAtrMult: 2.0,
        takeProfitR: 2.0,
        useTrailingStop: false,
        trailAtrMult: 0,
    },
    Conservative: {
        tradeThreshold: 0.65, // Zaten doğruydu — yüksek eşik, az-öz sinyal
        baseCooldown: 7,
        gamma: 0.5,
        cooldownMin: 3,
        cooldownMax: 20,
        requireCrossover: true,
        volatilityLookback: 30,
        stopLossAtrMult: 2.5,
        takeProfitR: 3.0,
        useTrailingStop: false,
        trailAtrMult: 0,
    },
};

/** Resolve the effective profile config from StrategyBacktestConfig */
export function getProfileConfig(config?: StrategyBacktestConfig): ProfileConfig {
    if (config?.signalProfile) {
        return PROFILE_CONFIGS[config.signalProfile];
    }
    // Default: Balanced
    return PROFILE_CONFIGS.Balanced;
}

/**
 * Volatility-Aware Dynamic Cooldown
 *
 * Cooldown süresini hissenin son 30 günlük oynaklığına (ATR) bağlar:
 *   - Oynaklık YÜKSEK (currentATR >> avgATR) → cooldown KISA (piyasa hızlı, çabuk tepki)
 *   - Oynaklık DÜŞÜK (currentATR << avgATR) → cooldown UZUN (piyasa stabil, az sinyal)
 *
 * Formula: CD = ceil(baseCD × (avgATR / currentATR)^gamma)
 *
 * Gamma=1.0 (Aggressive): oynaklık 2 katına çıkarsa cooldown yarıya iner (linear)
 * Gamma=0.5 (Conservative): oynaklık 2 katına çıkarsa cooldown √2 kadar iner (soft)
 */
function getDynamicCooldown(
    atrValues: number[],
    i: number,
    interval: string,
    config?: StrategyBacktestConfig
): number {
    // Explicit override takes precedence
    if (config?.cooldownBars !== undefined) return config.cooldownBars;

    // Resolve profile config
    const profile = getProfileConfig(config);
    const baseCD = profile.baseCooldown;
    const lookback = profile.volatilityLookback;

    // Interval adjustment: longer timeframes need shorter base cooldown (fewer bars)
    const intervalFactor = interval === '1wk' ? 0.5 : interval === '4h' ? 1.5 : 1.0;
    const adjustedBase = Math.max(1, Math.round(baseCD * intervalFactor));

    // Need enough ATR data
    if (i < lookback + 14 || i >= atrValues.length) return adjustedBase;

    const currentATR = atrValues[i];

    // Compute average ATR over volatilityLookback bars (30 by default)
    const lookbackStart = i - lookback;
    let sum = 0;
    for (let j = lookbackStart; j <= i; j++) {
        sum += atrValues[j];
    }
    const avgATR = sum / (lookback + 1);

    if (currentATR < 1e-10 || avgATR < 1e-10) return adjustedBase;

    // Volatility-aware cooldown calculation
    //   avgATR/currentATR > 1 → volatility below average → LONGER cooldown (stable market)
    //   avgATR/currentATR < 1 → volatility above average → SHORTER cooldown (volatile market)
    const gamma = profile.gamma;
    const dynamicCD = Math.ceil(adjustedBase * Math.pow(avgATR / currentATR, gamma));

    return Math.max(profile.cooldownMin, Math.min(profile.cooldownMax, dynamicCD));
}

/**
 * Detect market regime at bar index `i` using price action, ATR volatility, and MA slope.
 * - uptrend: ADX-approximation > 60, positive MA slope > 0.3%
 * - downtrend: ADX-approximation > 60, negative MA slope < -0.3%
 * - ranging: low MA slope (< 0.15%), normal volatility, ADX ~ 50
 * - volatile: ATR ratio > 1.8x (crisis/shock)
 * - neutral: default fallback
 */
export function detectRegime(candles: Candle[], i: number, atrValues: number[]): MarketRegime {
    if (i < 30) return 'neutral';

    // 1. Compute 20-bar SMA of close price
    let sumClose = 0;
    for (let j = i - 19; j <= i; j++) {
        sumClose += candles[j].close;
    }
    const sma20 = sumClose / 20;

    // 2. MA slope — % change over last 10 bars (using two 20-SMAs 10 bars apart)
    let sumPrev = 0;
    for (let j = i - 29; j <= i - 10; j++) {
        sumPrev += candles[j].close;
    }
    const prevSMA = sumPrev / 20;
    const maSlope = prevSMA !== 0 ? ((sma20 - prevSMA) / prevSMA) * 100 : 0;

    // 3. Volatility ratio: current ATR vs 20-bar average ATR
    const currentATR = atrValues[i] ?? 0;
    let sumATR = 0;
    const atrStart = Math.max(0, i - 19);
    for (let j = atrStart; j <= i; j++) {
        sumATR += atrValues[j] ?? currentATR;
    }
    const avgATR = sumATR / (i - atrStart + 1);
    const volRatio = avgATR > 0 ? currentATR / avgATR : 1;

    // 4. ADX approximation: directional price movement over 14 bars
    let upSum = 0, downSum = 0;
    const adxStart = Math.max(1, i - 13);
    for (let j = adxStart; j <= i; j++) {
        const move = candles[j].close - candles[j - 1].close;
        if (move > 0) upSum += move;
        else downSum -= move;
    }
    const totalMove = upSum + downSum;
    const adxApprox = totalMove > 0 ? (upSum / totalMove) * 100 : 50;

    // 5. Classify
    const isVolatile = volRatio > 1.8;
    const isTrending = Math.abs(maSlope) > 0.3 && (adxApprox > 60 || Math.abs(maSlope) > 0.5);
    const isRanging = Math.abs(maSlope) < 0.15 && volRatio < 1.2;
    const isUptrend = maSlope > 0;
    const isDowntrend = maSlope < 0;

    if (isVolatile) return 'volatile';
    if (isTrending && isUptrend) return 'uptrend';
    if (isTrending && isDowntrend) return 'downtrend';
    if (isRanging) return 'ranging';
    return 'neutral';
}

// ─── Beta-Binomial Posterior (Bayesian Meta-Learning) ──────────────────────

/**
 * Compute the posterior mean of a Beta-Binomial distribution.
 * Used to estimate historical win rate with uncertainty quantification.
 * Prior: Beta(1, 1) = uniform (uninformed).
 * Posterior: Beta(1 + wins, 1 + losses).
 * Returns the posterior mean: alpha / (alpha + beta).
 *
 * @param wins - Number of winning trades observed
 * @param losses - Number of losing trades observed
 * @param priorAlpha - Beta prior alpha (default: 1)
 * @param priorBeta - Beta prior beta (default: 1)
 * @returns Posterior mean win rate (0-1)
 */
export function getBetaPosterior(
    wins: number,
    losses: number,
    priorAlpha: number = 1,
    priorBeta: number = 1
): number {
    const alpha = priorAlpha + wins;
    const beta = priorBeta + losses;
    if (alpha + beta <= 0) return 0.5;
    return alpha / (alpha + beta);
}

// ─── 1. Pure-function strategy backtest engine ────────────────────────────────

/**
 * Pure-function backtest engine that mirrors StrategyBacktestMonitor's useEffect logic.
 * Takes candles, computed indicator data, and strategy config; returns win/loss stats.
 * No React state — usable from server actions, Inngest, or UI.
 */
export function runStrategyBacktest(
    candles: Candle[],
    strategyName: string,
    allData: AllData,
    config: StrategyBacktestConfig = { lookForward: 14 },
    options: {
        customIndicators?: string[];
        mode?: StrategyMode;
        interval?: string;
    } = {}
): StrategyBacktestResult {
    if (!candles || candles.length === 0) {
        const emptyBreakdown = {
            uptrend: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            downtrend: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            ranging: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            volatile: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            neutral: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
        } as Record<MarketRegime, RegimeStats>;
        return {
            winRate: 0, totalSignals: 0, wins: 0, history: [],
            profitFactor: 0, sharpeRatio: 0, avgWin: 0, avgLoss: 0,
            maxDrawdown: 0, totalReturn: 0, regimeBreakdown: emptyBreakdown,
        };
    }

    let wins = 0;
    let totalSignals = 0;
    const history: BacktestHistoryItem[] = [];
    const debugLog: BacktestLogEntry[] = [];

    // ─── Multi-Metric Tracking ───
    let grossProfit = 0;
    let grossLoss = 0;
    let winningSum = 0;       // Sum of winning trade returns %
    let losingSum = 0;        // Sum of losing trade returns %
    let winningCount = 0;
    let losingCount = 0;
    let totalReturnPct = 0;   // Cumulative net return %
    let peakEquity = 0;       // For max drawdown tracking
    let maxDrawdown = 0;
    const tradeReturns: number[] = [];  // All trade returns for Sharpe
    const regimeWins: Record<string, number> = { uptrend: 0, downtrend: 0, ranging: 0, volatile: 0, neutral: 0 };
    const regimeSignals: Record<string, number> = { uptrend: 0, downtrend: 0, ranging: 0, volatile: 0, neutral: 0 };
    const regimeReturnSums: Record<string, number> = { uptrend: 0, downtrend: 0, ranging: 0, volatile: 0, neutral: 0 };

    const { lookForward } = config;
    const mode = options.mode ?? 'all';

    // ── Timeframe Isolation Guard ──────────────────────────────────
    const interval = assertAllowedTimeframe(options.interval ?? '1d', 'strategy-optimizer.runStrategyBacktest');

    const isCustom = strategyName === 'CUSTOM' && options.customIndicators && options.customIndicators.length > 0;

    // Pre-compute ATR for dynamic cooldown and regime detection
    const atrValues = computeATR(candles, 14);

    // Initialize regime data array on allData for Phase 2 downstream use (voting weights)
    if (!allData.regimeData) {
        (allData as any).regimeData = [];
    }
    const regimeData = allData.regimeData!;

    // Dynamic warmup — longer intervals need fewer candles skipped
    const warmupMap: Record<string, number> = {
        '1d': 55, '4h': 55, '1wk': 25,
    };
    const startIndex = warmupMap[interval] ?? 55;
    const endIndex = candles.length - lookForward;

    // Resolve profile config for this run
    const profile = getProfileConfig(config);
    const TRADE_THRESHOLD = profile.tradeThreshold;
    const requireCrossover = config?.requireCrossover ?? profile.requireCrossover;

    // SPRINT 1 / B6: Cooldown'u yönlü (direction-aware) yapmak için önceki sinyal tipini takip et
    let lastSignalBar = -999;
    let lastSignalType: 'BUY' | 'SELL' | null = null;

    for (let i = startIndex; i < endIndex; i++) {
        const currentPrice = candles[i].close;
        const futurePrice = candles[i + lookForward].close;
        let signal: "BUY" | "SELL" | null = null;

        // Detect market regime for this bar (used for dynamic cooldown and Phase 2 voting weights)
        const regime = detectRegime(candles, i, atrValues);
        regimeData[i] = { regime };

        // Dynamic cooldown based on ATR volatility: high vol = shorter wait, low vol = longer wait
        const cd = getDynamicCooldown(atrValues, i, interval, config);
        const cooldownOk = (i - lastSignalBar) >= cd;
        // SPRINT 1 / B6: Yönlü cooldown — sellBypass commit-time'da hesaplanacak (signal null olabilir)
        let sellBypass = false;

        // ── BUILT-IN: RSI + CCI + WaveTrend ──
        if (strategyName === 'RSI_CCI_WT') {
            // SPRINT 1 / B4.2: Confidence gate — güvenilir olmayan göstergeler oylamaya dahil edilmez
            const rsiConf = allData.rsiData?.confidence?.[i];
            const w1Conf = allData.waveTrendData?.wt1Confidence?.[i];
            const w2Conf = allData.waveTrendData?.wt2Confidence?.[i];

            const rsiVal = allData.rsiData?.rsi[i]?.value;
            const rsiMa = allData.rsiData?.ma[i]?.value;
            const cciVal = allData.cciData?.cci[i]?.value;
            const cciMa = allData.cciData?.ma[i]?.value;

            const rsiOk = rsiConf !== 0 && rsiVal !== undefined && rsiMa !== undefined;
            const cciOk = cciVal !== undefined && cciMa !== undefined;
            const wt1 = allData.waveTrendData?.wt1[i]?.value;
            const wt2 = allData.waveTrendData?.wt2[i]?.value;
            const wtOk = w1Conf !== 0 && w2Conf !== 0 && wt1 !== undefined && wt2 !== undefined;

            if (rsiOk && cciOk) {
                const rsiSig = rsiSignal(rsiVal!, rsiMa!);
                const cciSig = cciSignal(cciVal!, cciMa!);
                let wtSig: "BUY" | "SELL" | null = null;

                if (wtOk) {
                    wtSig = waveTrendSignal(wt1!, wt2!);
                }

                const totalVoters = wtOk ? 3 : 2;
                const buyVotes = (rsiSig === 'BUY' ? 1 : 0) + (cciSig === 'BUY' ? 1 : 0) + (wtSig === 'BUY' ? 1 : 0);
                const sellVotes = (rsiSig === 'SELL' ? 1 : 0) + (cciSig === 'SELL' ? 1 : 0) + (wtSig === 'SELL' ? 1 : 0);
                const allAgree = buyVotes === totalVoters || sellVotes === totalVoters;

                // Fresh crossover check — toggleable via requireCrossover
                const anyFreshCross = requireCrossover
                    ? hasFreshCrossover('rsi', i, allData) ||
                    hasFreshCrossover('cci', i, allData) ||
                    (wtOk && hasFreshCrossover('wavetrend', i, allData))
                    : true; // Crossover check SKIPPED (Aggressive mode)

                if (allAgree && anyFreshCross) {
                    // SPRINT 1 / B6: cooldownOk gate kaldırıldı — commit-time'da yönlü bypass uygulanacak
                    signal = buyVotes === totalVoters ? 'BUY' : 'SELL';
                }
            }
        }
        // ── CUSTOM: Dempster-Shafer voting fusion (SPRINT 2 / B5 verified) ──
        // B5 doğrulaması: Bu branch AND-chain DEĞİL, soft-vote (DST weighted fusion) kullanır.
        //   - Her göstergenin sinyali → Basic Belief Assignment (BBA) dönüşür
        //   - BBA'lar Dempster's Rule of Combination ile birleştirilir (fuseAll)
        //   - Toplam inanç TRADE_THRESHOLD'u aşarsa → sinyal üretilir
        // AND-chain SADECE RSI_CCI_WT built-in stratejisinde vardır (intentional, by design).
        // DE'nin fitness fonksiyonu (computeCompositeScore) yalnızca sıralama içindir,
        // sinyal üretiminde AND-dayatması yoktur. Refactor gerekmez.
        else if (isCustom) {
            const inds = options.customIndicators!;
            const bbas: BBA[] = [];
            let anyFreshCross = false;

            for (const key of inds) {
                const sig = getIndicatorSignal(key, i, allData, candles);
                if (sig === null) continue;

                // Convert signal to belief mass, using detected regime for uncertainty adjustment
                bbas.push(signalToBBA(sig, 0.6, regime));

                if (requireCrossover && !anyFreshCross && hasFreshCrossover(key, i, allData, candles)) {
                    anyFreshCross = true;
                }
            }

            // requireCrossover=false → anyFreshCross is always true (no crossover check)
            const crossoverPass = requireCrossover ? anyFreshCross : true;

            if (bbas.length >= 2 && crossoverPass) {
                // SPRINT 1 / B6: cooldownOk gate kaldırıldı — commit-time'da yönlü bypass uygulanacak
                // Fuse all indicator beliefs using Dempster's Rule of Combination
                const fused = fuseAll(bbas);

                if (fused.buy > TRADE_THRESHOLD && fused.buy > fused.sell) {
                    signal = 'BUY';
                } else if (fused.sell > TRADE_THRESHOLD && fused.sell > fused.buy) {
                    signal = 'SELL';
                }
                // If neither exceeds threshold → no trade (avoids forced false signals)
            }
        }

        // ── Debug Log: record per-bar signal detail when enabled ──
        if (config.debugLog) {
            const indicatorSignals: IndicatorLogEntry[] = [];

            if (strategyName === 'RSI_CCI_WT') {
                // Built-in path: re-query from allData
                const rsiVal = allData.rsiData?.rsi[i]?.value;
                const rsiMa = allData.rsiData?.ma[i]?.value;
                const cciVal = allData.cciData?.cci[i]?.value;
                const cciMa = allData.cciData?.ma[i]?.value;

                if (rsiVal !== undefined && rsiMa !== undefined) {
                    const rsiSig = rsiSignal(rsiVal, rsiMa);
                    indicatorSignals.push({
                        key: 'rsi',
                        signal: rsiSig,
                        bba: signalToBBA(rsiSig, 0.6, regime),
                        freshCrossover: hasFreshCrossover('rsi', i, allData),
                        regime,
                    });
                }
                if (cciVal !== undefined && cciMa !== undefined) {
                    const cciSig = cciSignal(cciVal, cciMa);
                    indicatorSignals.push({
                        key: 'cci',
                        signal: cciSig,
                        bba: signalToBBA(cciSig, 0.6, regime),
                        freshCrossover: hasFreshCrossover('cci', i, allData),
                        regime,
                    });
                }
                if (allData.waveTrendData) {
                    const wt1 = allData.waveTrendData.wt1[i]?.value;
                    const wt2 = allData.waveTrendData.wt2[i]?.value;
                    if (wt1 !== undefined && wt2 !== undefined) {
                        const wtSig = waveTrendSignal(wt1, wt2);
                        indicatorSignals.push({
                            key: 'wavetrend',
                            signal: wtSig,
                            bba: signalToBBA(wtSig, 0.6, regime),
                            freshCrossover: hasFreshCrossover('wavetrend', i, allData),
                            regime,
                        });
                    }
                }
            } else if (isCustom) {
                const inds = options.customIndicators!;
                for (const key of inds) {
                    const sig = getIndicatorSignal(key, i, allData, candles);
                    if (sig === null) continue;
                    indicatorSignals.push({
                        key,
                        signal: sig,
                        bba: signalToBBA(sig, 0.6, regime),
                        freshCrossover: hasFreshCrossover(key, i, allData, candles),
                        regime,
                    });
                }
            }

            // Determine rejection reason — respect requireCrossover flag
            let rejectionReason: string | undefined;
            if (!signal) {
                const parts: string[] = [];
                if (requireCrossover) {
                    const anyFreshCross = indicatorSignals.some(s => s.freshCrossover);
                    if (!anyFreshCross) parts.push('No fresh crossover');
                }
                if (!cooldownOk) parts.push(`Cooldown active (${i - lastSignalBar}/${cd})`);
                if (indicatorSignals.length < 2) parts.push(`Only ${indicatorSignals.length} indicator(s) active`);
                rejectionReason = parts.length > 0 ? parts.join('; ') : 'Signal threshold not met';
            }

            debugLog.push({
                barIndex: i,
                date: candles[i].time,
                price: currentPrice,
                indicatorSignals,
                gates: {
                    freshCrossoverOk: requireCrossover ? indicatorSignals.some(s => s.freshCrossover) : true,
                    cooldownOk,
                    cooldownValue: cd,
                    thresholdOk: signal !== null,
                    maskOk: !config.signalMask || !!config.signalMask[i],
                },
                decision: signal,
                rejectionReason,
                ...(signal ? {
                    tradeOutcome: {
                        futurePrice,
                        rawReturn: (futurePrice - currentPrice) / currentPrice,
                        isWin: (signal === 'BUY' ? 1 : -1) * (futurePrice - currentPrice) / currentPrice > 0,
                    },
                } : {}),
            });
        }

        if (signal) {
            // SPRINT 1 / B6: Yönlü cooldown bypass — eğer yeni sinyal SELL ise ve
            // önceki sinyal BUY ise, cooldown'u bypass et. Bu sayede trader
            // açık pozisyonu panik çıkışla veya ters sinyalle kapatabilir.
            sellBypass = !cooldownOk && signal === 'SELL' && lastSignalType === 'BUY';

            // ── Index Masking (Hyperband low-fidelity) ──
            // Uint8Array direct read: ~2ns vs Set.has(i) ~35ns.
            // Zero allocation, no GC pressure in hot-loop.
            if (config.signalMask && !config.signalMask[i]) continue;

            // SPRINT 1 / B6: Cooldown gate — ya normal cooldown geçerli ya da SELL bypass
            if (!cooldownOk && !sellBypass) continue;

            totalSignals++;
            lastSignalBar = i;
            // SPRINT 1 / B6: Bir sonraki bar için son sinyal tipini hatırla
            lastSignalType = signal;

            // ── Compute trade return — path-aware or legacy lookforward ──
            let tradeReturn: number;
            let isWin: boolean;
            let tradeMfe: number | undefined;
            let tradeMae: number | undefined;
            let tradeIntraDD: number | undefined;
            let tradeExitReason: string | undefined;
            let tradeBarsHeld: number | undefined;
            let effectiveFuturePrice = futurePrice;

            const evalMode = config.evaluationMode ?? 'lookforward';

            if (evalMode === 'pathaware' || evalMode === 'regime') {
                // Path-aware: simulate trade bar-by-bar
                const profileCfg = getProfileConfig(config);
                const tradeRiskCfg: TradeRiskConfig = config.riskConfig ?? {
                    stopLossAtrMult: profileCfg.stopLossAtrMult,
                    takeProfitR: profileCfg.takeProfitR,
                    useTrailingStop: profileCfg.useTrailingStop,
                    trailAtrMult: profileCfg.trailAtrMult,
                    timeStopBars: lookForward,
                };
                const simResult = simulateTrade(candles, i, signal, atrValues, tradeRiskCfg);
                tradeReturn = simResult.realizedReturnPct / 100; // Convert % to ratio for consistency
                isWin = tradeReturn > 0;
                tradeMfe = simResult.mfe;
                tradeMae = simResult.mae;
                tradeIntraDD = simResult.intraTradeMaxDD;
                tradeExitReason = simResult.exitReason;
                tradeBarsHeld = simResult.barsHeld;
                effectiveFuturePrice = simResult.exitPrice;
            } else {
                // Legacy lookforward: 2-point comparison
                const rawReturn = (futurePrice - currentPrice) / currentPrice;
                tradeReturn = signal === 'BUY' ? rawReturn : -rawReturn;
                isWin = tradeReturn > 0;
            }

            if (isWin) wins++;

            // ─── Multi-Metric Accumulators ───
            totalReturnPct += tradeReturn;
            if (tradeReturn > 0) {
                grossProfit += tradeReturn;
                winningSum += tradeReturn;
                winningCount++;
            } else {
                grossLoss += Math.abs(tradeReturn);
                losingSum += Math.abs(tradeReturn);
                losingCount++;
            }
            tradeReturns.push(tradeReturn);

            // Regime-based tracking
            regimeWins[regime] += isWin ? 1 : 0;
            regimeSignals[regime] = (regimeSignals[regime] || 0) + 1;
            regimeReturnSums[regime] = (regimeReturnSums[regime] || 0) + tradeReturn;

            // Drawdown tracking
            if (totalReturnPct > peakEquity) {
                peakEquity = totalReturnPct;
            }
            const dd = peakEquity - totalReturnPct;
            if (dd > maxDrawdown) maxDrawdown = dd;

            history.push({
                time: candles[i].time,
                signal,
                price: currentPrice,
                futurePrice: effectiveFuturePrice,
                isWin,
                mfe: tradeMfe,
                mae: tradeMae,
                intraTradeDD: tradeIntraDD,
                exitReason: tradeExitReason,
                barsHeld: tradeBarsHeld,
                realizedReturn: (evalMode !== 'lookforward') ? tradeReturn * 100 : undefined,
            });
        }
    }

    const winRate = totalSignals > 0 ? (wins / totalSignals) * 100 : 0;

    // ─── Compute Multi-Metrics ───
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

    // Sharpe Ratio: annualized, using Welford online algorithm for numerical stability
    let sharpeRatio = 0;
    if (tradeReturns.length >= 2) {
        let mean = 0, m2 = 0;
        for (let t = 0; t < tradeReturns.length; t++) {
            const x = tradeReturns[t];
            const delta = x - mean;
            mean += delta / (t + 1);
            m2 += delta * (x - mean);
        }
        const variance = m2 / (tradeReturns.length - 1);
        const std = Math.sqrt(Math.max(variance, 1e-10));
        sharpeRatio = (mean / std) * Math.sqrt(252);
    }

    const avgWin = winningCount > 0 ? winningSum / winningCount : 0;
    const avgLoss = losingCount > 0 ? losingSum / losingCount : 0;

    // Regime breakdown
    const allRegimes: MarketRegime[] = ['uptrend', 'downtrend', 'ranging', 'volatile', 'neutral'];
    const regimeBreakdown = {} as Record<MarketRegime, RegimeStats>;
    for (const r of allRegimes) {
        const sigs = regimeSignals[r] || 0;
        const w = regimeWins[r] || 0;
        const retSum = regimeReturnSums[r] || 0;
        regimeBreakdown[r] = {
            winRate: sigs > 0 ? (w / sigs) * 100 : 0,
            totalSignals: sigs,
            wins: w,
            avgReturn: sigs > 0 ? retSum / sigs : 0,
            totalReturn: retSum,
        };
    }

    // ─── Path-Aware Aggregate Metrics ───
    const evalMode = config.evaluationMode ?? 'lookforward';
    let avgMFE: number | undefined;
    let avgMAE: number | undefined;
    let avgBarsHeld: number | undefined;
    let exitReasonBreakdown: Record<string, number> | undefined;

    if (evalMode !== 'lookforward' && totalSignals > 0) {
        let sumMFE = 0, sumMAE = 0, sumBars = 0;
        const exitCounts: Record<string, number> = {};
        for (const h of history) {
            if (h.mfe !== undefined) sumMFE += h.mfe;
            if (h.mae !== undefined) sumMAE += h.mae;
            if (h.barsHeld !== undefined) sumBars += h.barsHeld;
            if (h.exitReason) {
                exitCounts[h.exitReason] = (exitCounts[h.exitReason] || 0) + 1;
            }
        }
        avgMFE = sumMFE / totalSignals;
        avgMAE = sumMAE / totalSignals;
        avgBarsHeld = sumBars / totalSignals;
        exitReasonBreakdown = exitCounts;
    }

    // ─── Portfolio Simulation ───
    let portfolioResult: import('./portfolio-simulator').PortfolioSimResult | undefined;
    let equityCurve: { time: string | number; equity: number }[] | undefined;
    let drawdownCurve: { time: string | number; drawdownPct: number }[] | undefined;
    let finalEquity: number | undefined;
    let cagr: number | undefined;
    let maxDrawdownPct: number | undefined;

    if (evalMode !== 'lookforward' && config.portfolioConfig) {
        // Reconstruct signals into PortfolioSignalEntry format
        const portfolioSignals: import('./portfolio-simulator').PortfolioSignalEntry[] = history
            .filter((h) => h.exitReason !== undefined && h.realizedReturn !== undefined) // Only trades that actually simulated
            .map((h) => {
                // Find the entry bar index by searching candles for the exact time
                // (In a real production system, you'd track the entry index directly on the history item to avoid O(N^2))
                const entryIndex = candles.findIndex((c) => c.time === h.time);
                return {
                    barIndex: entryIndex !== -1 ? entryIndex : 0,
                    signal: h.signal,
                    simulatedTrade: {
                        entryIndex: entryIndex !== -1 ? entryIndex : 0,
                        exitIndex: (entryIndex !== -1 && h.barsHeld !== undefined) ? entryIndex + h.barsHeld : 0,
                        exitReason: h.exitReason as any,
                        entryPrice: h.price,
                        exitPrice: h.futurePrice,
                        realizedReturnPct: h.realizedReturn!,
                        mfe: h.mfe ?? 0,
                        mae: h.mae ?? 0,
                        intraTradeMaxDD: h.intraTradeDD ?? 0,
                        barsHeld: h.barsHeld ?? 0,
                    }
                };
            })
            .filter((entry) => entry.barIndex !== -1);

        const runPortfolioSimulation = require('./portfolio-simulator').runPortfolioSimulation;
        const resampleCurve = require('./portfolio-simulator').resampleCurve;

        portfolioResult = runPortfolioSimulation(candles, portfolioSignals, config.portfolioConfig);
        
        // We resample curves here to prevent massive array serialization issues downstream (e.g. Inngest)
        // 200 points is enough resolution for a chart
        equityCurve = resampleCurve(portfolioResult.equityCurve, 200);
        drawdownCurve = resampleCurve(portfolioResult.drawdownCurve, 200);
        finalEquity = portfolioResult.finalEquity;
        cagr = portfolioResult.cagr;
        maxDrawdownPct = portfolioResult.maxDrawdownPct;
    }

    return {
        winRate,
        totalSignals,
        wins,
        history,
        profitFactor,
        sharpeRatio,
        avgWin,
        avgLoss,
        maxDrawdown,
        totalReturn: totalReturnPct,
        regimeBreakdown,
        log: config.debugLog ? debugLog : undefined,
        evaluationMode: evalMode,
        avgMFE,
        avgMAE,
        avgBarsHeld,
        exitReasonBreakdown,
        portfolioResult,
        equityCurve,
        drawdownCurve,
        finalEquity,
        cagr,
        maxDrawdownPct,
    };
}

// ─── Generalization Score (Train/Test Validation) ─────────────────────────

/**
* Evaluate how well a parameter set generalizes by combining train/test Win Rates
* with an overfitting penalty. Returns a score in [0, 1].
*
* Formula: HARMONIC_MEAN(trainWR, testWR) × (1 - overfitPenalty × 0.5)
* - Harmonic mean: rewards both train and test being high
* - Overfitting penalty: large train-test gap reduces score
*/
export function evaluateGeneralizationScore(
    trainWR: number,
    testWR: number,
    minSignals: number = 20
): number {
    if (trainWR <= 0 || testWR <= 0) return 0;

    // Harmonic mean: rewards both being high together
    const harmonicMean = 2 * (trainWR * testWR) / (trainWR + testWR);

    // Overfitting penalty: large gap between Train and Test
    const gap = Math.abs(trainWR - testWR);
    const maxWR = Math.max(trainWR, testWR);
    const overfitPenalty = maxWR > 0 ? gap / maxWR : 1;

    // Final score: harmonic mean discounted by overfitting (50% penalty weight)
    return harmonicMean * (1 - overfitPenalty * 0.5);
}

// ─── 2. Sequential Strategy Parameter Optimization ────────────────────────────

/**
* Sequential Optimization with Train/Test split: optimizes lookForward first,
* then each indicator's primary parameter one at a time. Uses generalization
* score instead of raw Win Rate to avoid overfitting.
*/
export function optimizeStrategyParams(
    candles: Candle[],
    allData: AllData,
    config: StrategyOptimizationConfig
): StrategyOptimizationResult {
    const indicators = config.indicators;
    const lfRange = config.lookForwardRange ?? [5, 30];
    const interval = config.interval ?? '1d';
    const mode = config.mode ?? 'all';
    const convergenceRounds = config.convergenceRounds ?? 1;

    // ── Train/Test Split (70/30) ──────────────────────────────────────
    const splitIdx = Math.floor(candles.length * 0.7);
    const trainCandles = candles.slice(0, splitIdx);
    const testCandles = candles.slice(splitIdx);

    // Start with the first lookForward value from the range; optimizable indicator params are added as we iterate
    const [lfRangeStart] = lfRange;
    const bestParams: Record<string, number> = { lookForward: lfRangeStart };
    let bestScore = 0;
    let bestWinRate = 0;
    const roundResults: RoundResult[] = [];
    let iterations = 0;

    // Map indicator key → optimizer param entry
    // SPRINT 2 / B2: Timeframe-aware range — 4h swing trade için [14, 42] geniş uzayı
    const paramMap: Record<string, { param: string; range: [number, number] }> = {};
    for (const ind of indicators) {
        const entry = OPTIMIZABLE_INDICATORS[ind.toUpperCase()];
        if (entry) {
            paramMap[ind] = { param: entry.param, range: rangeForTimeframe(ind, interval) };
        }
    }

    // Hoisted outside the convergence loop so the final full-data backtest
    // can access the recomputed indicator data with best params.
    let carryForwardAllData = allData;

    for (let round = 0; round < convergenceRounds; round++) {
        // --- Optimize lookForward (Train/Test split) ---
        const [lfStart, lfEnd] = lfRange;
        for (let lf = lfStart; lf <= lfEnd; lf++) {
            const backtestConfig = {
                lookForward: lf,
                interval,
                mode,
            };
            const indicatorConfig = {
                customIndicators: indicators.length > 0 ? indicators : undefined,
                mode,
                interval,
            };
            const strategyType = indicators.length > 0 ? 'CUSTOM' : 'RSI_CCI_WT';

            const trainResult = runStrategyBacktest(trainCandles, strategyType, allData, backtestConfig, indicatorConfig);
            const testResult = runStrategyBacktest(testCandles, strategyType, allData, backtestConfig, indicatorConfig);
            iterations += 2;

            const score = evaluateGeneralizationScore(trainResult.winRate, testResult.winRate);
            if (score > bestScore) {
                bestScore = score;
                bestWinRate = testResult.winRate; // Report out-of-sample Win Rate
                bestParams.lookForward = lf;
            }
        }
        if (round === 0) {
            roundResults.push({ param: 'lookForward', value: bestParams.lookForward, winRate: bestWinRate });
        }

        // --- Optimize each indicator's parameter (Train/Test split) ---
        // Carry-forward optimization: each indicator is optimized against the BEST-KNOWN
        // data of all previously optimized indicators (not against defaults).
        // This prevents "state desync" where optimizing indicator B loses the gains
        // made by optimizing indicator A.
        carryForwardAllData = allData; // reset for this round, will be updated as we go

        for (const ind of indicators) {
            const entry = paramMap[ind];
            if (!entry) continue;
            const [start, end] = entry.range;
            const optimizerEntry = OPTIMIZABLE_INDICATORS[ind.toUpperCase()];
            if (!optimizerEntry) continue;

            // Initialize param (ensures bestParams includes this key)
            bestParams[entry.param] = start;
            let bestAllData = carryForwardAllData;

            // Bayesian TPE optimization replaces brute-force search
            const rangeSpan = end - start;
            const boResult = bayesianOptimize(
                {
                    paramRanges: { [entry.param]: [start, end] },
                    nInitialSamples: Math.min(5, Math.max(3, Math.floor(rangeSpan / 3))),
                    nEIOptimizations: Math.max(5, Math.min(20, Math.floor(rangeSpan / 2))),
                    gamma: 0.2,
                },
                (params) => {
                    const val = params[entry.param];
                    const clampedVal = Math.max(start, Math.min(end, Math.round(val)));

                    const rawData = optimizerEntry.compute(candles, clampedVal);
                    const formattedData = optimizerEntry.formatData(rawData);

                    const updatedAllData: AllData = { ...carryForwardAllData };
                    const dataField = INDICATOR_TO_ALLDATA_FIELD[ind];
                    if (dataField) {
                        (updatedAllData as any)[dataField] = formattedData as any;
                    }

                    const backtestConfig = {
                        lookForward: bestParams.lookForward,
                        interval,
                        mode,
                    };
                    const indicatorConfig = {
                        customIndicators: indicators,
                        mode,
                        interval,
                    };

                    const trainResult = runStrategyBacktest(trainCandles, 'CUSTOM', updatedAllData, backtestConfig, indicatorConfig);
                    const testResult = runStrategyBacktest(testCandles, 'CUSTOM', updatedAllData, backtestConfig, indicatorConfig);
                    iterations += 2;

                    const score = evaluateGeneralizationScore(trainResult.winRate, testResult.winRate);

                    // Track best by generalization score for carry-forward
                    if (score > bestScore) {
                        bestScore = score;
                        bestWinRate = testResult.winRate; // Report out-of-sample WR
                        bestParams[entry.param] = clampedVal;
                        bestAllData = updatedAllData;
                    }

                    return { winRate: testResult.winRate, totalSignals: testResult.totalSignals };
                }
            );

            // Ensure best params from BO are captured
            if (boResult[entry.param] !== undefined) {
                const bestVal = Math.max(start, Math.min(end, Math.round(boResult[entry.param])));
                bestParams[entry.param] = bestVal;

                // Recompute final allData for carry-forward using best param
                const rawData = optimizerEntry.compute(candles, bestVal);
                const formattedData = optimizerEntry.formatData(rawData);
                const finalAllData: AllData = { ...carryForwardAllData };
                const dataField = INDICATOR_TO_ALLDATA_FIELD[ind];
                if (dataField) {
                    (finalAllData as any)[dataField] = formattedData as any;
                }
                const backtestConfig = {
                    lookForward: bestParams.lookForward,
                    interval,
                    mode,
                };
                const indicatorConfig = {
                    customIndicators: indicators,
                    mode,
                    interval,
                };
                const finalTrainResult = runStrategyBacktest(trainCandles, 'CUSTOM', finalAllData, backtestConfig, indicatorConfig);
                const finalTestResult = runStrategyBacktest(testCandles, 'CUSTOM', finalAllData, backtestConfig, indicatorConfig);
                iterations += 2;

                const finalScore = evaluateGeneralizationScore(finalTrainResult.winRate, finalTestResult.winRate);
                if (finalScore > bestScore) {
                    bestScore = finalScore;
                    bestWinRate = finalTestResult.winRate;
                    bestAllData = finalAllData;
                }
            }

            // Carry forward the best allData for the next indicator
            carryForwardAllData = bestAllData;

            if (round === 0) {
                roundResults.push({ param: entry.param, value: bestParams[entry.param], winRate: bestWinRate });
            }
        }
    }

    // ── Final full-data validation backtest ──────────────────────────────
    // After convergence, the bestWinRate is only the test-set (out-of-sample, 30%).
    // Run one final full-data backtest with the best params + recomputed indicators
    // (carryForwardAllData) so the reported win rate reflects full historical
    // performance — mirroring what localRefine does (ga-optimizer.ts:825-833).
    const finalConfig: StrategyBacktestConfig = {
        lookForward: bestParams.lookForward,
        interval,
        mode,
    };
    const finalIndicatorCfg = {
        customIndicators: indicators.length > 0 ? indicators : undefined,
        mode,
        interval,
    };
    const strategyType = indicators.length > 0 ? 'CUSTOM' : 'RSI_CCI_WT';
    const finalResult = runStrategyBacktest(candles, strategyType, carryForwardAllData, finalConfig, finalIndicatorCfg);
    bestWinRate = finalResult.winRate;

    return { bestParams, bestWinRate, iterations, roundResults };
}

// Legacy re-export for backward compatibility.
// New code should import DISCOVERY_POOL from './indicator-registry' directly.
export { DISCOVERY_POOL };

/**
 * @deprecated Sampling limit removed. Use the new deep discovery pipeline
 * (lib/inngest/discovery-deep-search.ts) for exhaustive search.
 */
const MAX_COMBOS_TO_SCREEN = 500;
const SCREEN_TOP_N = 50;
/** Phase 2 tests each combo with multiple lookForward values to avoid screening out
 *  combos that perform poorly at lookForward=14 but excel at other values. */
const SCREEN_LOOKFORWARD_VALUES = [7, 14, 21];

/**
 * @deprecated Use the new deep discovery pipeline instead:
 * - POST /api/discovery/deep-search → creates an async Inngest job
 * - GET /api/jobs/:jobId → polls for progress and results
 *
 * The new pipeline provides:
 * - 100% search space coverage (vs 15.6% here)
 * - Joint parameter optimization (vs sequential here)
 * - Diversity ranking (Top 10 spans different indicator counts)
 * - Cross-validation with overfitting detection
 *
 * This function is kept for backward compatibility with existing UI.
 *
 * 4-Phase Discovery Engine (LEGACY):
 * Phase 1: Generate all 2-to-N indicator combinations from pool (N = pool.length)
 * Phase 2: Quick-screen with multiple lookForward values [7,14,21], keep top 50
 * Phase 3: Genetic Algorithm — joint optimization of indicator selection + params
 * Phase 4: Local Refinement — hill-climbing on top 5 GA results
 */
export function discoverStrategy(
    candles: Candle[],
    allData: AllData,
    options: {
        indicatorPool?: string[];
        minIndicators?: number;
        maxIndicators?: number;
        interval?: string;
        mode?: StrategyMode;
        topN?: number;
    } = {}
): DiscoveryResult {
    const pool = options.indicatorPool ?? DISCOVERY_POOL;
    const minN = options.minIndicators ?? 2;
    const maxN = options.maxIndicators ?? Math.min(pool.length, MAX_INDICATORS);
    const interval = options.interval ?? '1d';
    const mode = options.mode ?? 'all';
    const topN = options.topN ?? 5;

    // ── Phase 1: Generate combinations ──
    let allCombos: string[][] = [];
    for (let n = minN; n <= maxN; n++) {
        const combos = combinations(pool, n);
        allCombos.push(...combos);
    }

    // Prune if too many
    if (allCombos.length > MAX_COMBOS_TO_SCREEN) {
        // Stratified sampling: ensure representation from each n
        const sampled: string[][] = [];
        const perN = Math.floor(MAX_COMBOS_TO_SCREEN / (maxN - minN + 1));
        for (let n = minN; n <= maxN; n++) {
            const combosN = combinations(pool, n);
            const shuffled = [...combosN].sort(() => Math.random() - 0.5);
            sampled.push(...shuffled.slice(0, perN));
        }
        allCombos = sampled.slice(0, MAX_COMBOS_TO_SCREEN);
    }

    // ── Phase 2: Quick-screen with multiple lookForward values ──
    // Test each combo with several lookForward values (7, 14, 21) and keep the
    // best win rate. This prevents screening out combos that need a different
    // lookForward to perform well.
    interface ScreenEntry {
        indicators: string[];
        winRate: number;
        totalSignals: number;
    }
    const screened: ScreenEntry[] = [];

    // FA-002 HOTFIX: Phase 2 hard timeout — 5s sonra partial result döndür.
    // Kalan combo'lar Phase 3 (GA) tarafından keşfedilebilir, bu yüzden veri kaybı minimal.
    // Eski davranış: tüm 816 combo × 3 lookForward = 2448 backtest sıralı → 2-5 dakika main thread blokajı.
    const phase2StartTime = Date.now();
    const PHASE2_TIMEOUT_MS = 5000;
    let phase2Processed = 0;
    let phase2TimedOut = false;
    for (const combo of allCombos) {
        if (phase2Processed > 0 && Date.now() - phase2StartTime > PHASE2_TIMEOUT_MS) {
            console.warn(`[Phase2] Timeout: ${phase2Processed}/${allCombos.length} combos tested, returning partial. Remaining combos will be explored by Phase 3 (GA).`);
            phase2TimedOut = true;
            break;
        }
        phase2Processed++;
        let bestResult = { winRate: 0, totalSignals: 0 };
        for (const lf of SCREEN_LOOKFORWARD_VALUES) {
            const result = runStrategyBacktest(candles, 'CUSTOM', allData, {
                lookForward: lf,
                interval,
                mode,
            }, {
                customIndicators: combo,
                mode,
                interval,
            });
            if (result.winRate > bestResult.winRate) {
                bestResult = { winRate: result.winRate, totalSignals: result.totalSignals };
            }
        }
        screened.push({
            indicators: combo,
            winRate: bestResult.winRate,
            totalSignals: bestResult.totalSignals,
        });
    }

    // Filter out combos with too few signals (overfitting prevention),
    // then sort by composite score (winRate × √totalSignals) descending.
    // This ensures high-signal strategies with good WR rank above
    // low-signal strategies with marginally higher WR (overfitted).
    const viable = screened.filter(e => e.totalSignals >= MIN_SIGNAL_THRESHOLD);
    viable.sort((a, b) => (b.winRate * Math.sqrt(b.totalSignals)) - (a.winRate * Math.sqrt(a.totalSignals)));
    const topScreen = viable.slice(0, SCREEN_TOP_N);

    // ── Phase 3: Genetic Algorithm ──
    // Jointly optimizes indicator selection AND parameters simultaneously.
    // Population: 150 (seeds from topScreen + random + mutated seeds)
    // Evolution: up to 100 generations with early termination after 10 stale generations
    const gaPopulation = geneticOptimize(candles, allData, topScreen.map(e => ({
        indicators: e.indicators,
        winRate: e.winRate,
        totalSignals: e.totalSignals,
        bestLookForward: undefined, // Let GA discover optimal lookForward
    })), {
        interval,
        mode,
    });

    // ── Phase 4: Local Refinement ──
    // Take top 5 GA results and apply sequential hill-climbing optimization.
    // This combines GA's global search with local gradient descent.
    let discovered = localRefine(gaPopulation, candles, allData, interval, mode, topN);

    // Ensure final sort and rank (localRefine already sorts, but safeguard)
    discovered.sort((a, b) => b.winRate - a.winRate);
    discovered.forEach((ds, idx) => { ds.rank = idx + 1; });

    const best = discovered.length > 0 ? discovered[0] : {
        indicators: [], params: {}, winRate: 0, totalSignals: 0, rank: 1,
    };

    return {
        best,
        all: discovered.slice(0, topN),
        totalCombinationsTested: allCombos.length,
        poolSize: pool.length,
    };
}
