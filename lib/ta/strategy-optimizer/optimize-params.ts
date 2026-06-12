// lib/ta/strategy-optimizer/optimize-params.ts
// Ported from monolith strategy-optimizer.ts

import type { Candle } from '../types';
import { OPTIMIZABLE_INDICATORS, rangeForTimeframe } from '../optimizer';
import { bayesianOptimize } from '../optimization/bayesian-optimizer';
import { INDICATOR_TO_ALLDATA_FIELD } from '../registry/indicator-all-data-map';
import { runStrategyBacktest, evaluateGeneralizationScore } from './run-backtest';
import { PARAM_DEFAULTS_NUM } from '../../constants/indicator-params';

export function sanitizeParams(params: Record<string, number>): Record<string, number> {
    const sanitized: Record<string, number> = {};
    for (const [key, val] of Object.entries(params)) {
        if (key === 'lookForward' || key.toLowerCase() in PARAM_DEFAULTS_NUM) {
            sanitized[key] = val;
        }
    }
    return sanitized;
}

import type {
    AllData,
    StrategyOptimizationConfig,
    StrategyOptimizationResult,
    RoundResult,
    StrategyBacktestConfig,
} from './types';

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
    const strategyType = config.strategyName === 'RSI_CCI_WT' ? 'RSI_CCI_WT' : (indicators.length > 0 ? 'CUSTOM' : 'RSI_CCI_WT');

    // ── Baseline Evaluation ───────────────────────────────────────────
    const initialLookForward = config.initialParams?.lookForward ?? 14;
    const initialConfig: StrategyBacktestConfig = {
        lookForward: initialLookForward,
        interval,
        mode,
    };
    const initialIndicatorCfg = {
        customIndicators: indicators.length > 0 ? indicators : undefined,
        mode,
        interval,
    };
    const initialResult = runStrategyBacktest(candles, strategyType, allData, initialConfig, initialIndicatorCfg);
    const initialWinRate = initialResult.winRate;
    const initialProfitFactor = initialResult.profitFactor;

    // ── Train/Test Split (70/30) ──────────────────────────────────────
    const splitIdx = Math.floor(candles.length * 0.7);
    const trainCandles = candles.slice(0, splitIdx);
    const testCandles = candles.slice(splitIdx);

    const [lfRangeStart] = lfRange;
    const bestParams: Record<string, number> = { lookForward: lfRangeStart };
    let bestScore = 0;
    let bestWinRate = 0;
    const roundResults: RoundResult[] = [];
    let iterations = 0;

    const paramMap: Record<string, { param: string; range: [number, number] }> = {};
    for (const ind of indicators) {
        const entry = OPTIMIZABLE_INDICATORS[ind.toUpperCase()];
        if (entry) {
            paramMap[ind] = { param: entry.param, range: rangeForTimeframe(ind, interval) };
        }
    }

    let carryForwardAllData = allData;

    for (let round = 0; round < convergenceRounds; round++) {
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

            const trainResult = runStrategyBacktest(trainCandles, strategyType, allData, backtestConfig, indicatorConfig);
            const testResult = runStrategyBacktest(testCandles, strategyType, allData, backtestConfig, indicatorConfig);
            iterations += 2;

            const score = evaluateGeneralizationScore(trainResult.winRate, testResult.winRate);
            if (score > bestScore) {
                bestScore = score;
                bestWinRate = testResult.winRate;
                bestParams.lookForward = lf;
            }
        }
        if (round === 0) {
            roundResults.push({ param: 'lookForward', value: bestParams.lookForward, winRate: bestWinRate });
        }

        carryForwardAllData = allData;

        for (const ind of indicators) {
            const entry = paramMap[ind];
            if (!entry) continue;
            const [start, end] = entry.range;
            const optimizerEntry = OPTIMIZABLE_INDICATORS[ind.toUpperCase()];
            if (!optimizerEntry) continue;

            bestParams[entry.param] = start;
            let bestAllData = carryForwardAllData;

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

                    const trainResult = runStrategyBacktest(trainCandles, strategyType, updatedAllData, backtestConfig, indicatorConfig);
                    const testResult = runStrategyBacktest(testCandles, strategyType, updatedAllData, backtestConfig, indicatorConfig);
                    iterations += 2;

                    const score = evaluateGeneralizationScore(trainResult.winRate, testResult.winRate);

                    if (score > bestScore) {
                        bestScore = score;
                        bestWinRate = testResult.winRate;
                        bestParams[entry.param] = clampedVal;
                        bestAllData = updatedAllData;
                    }

                    return { winRate: testResult.winRate, totalSignals: testResult.totalSignals };
                }
            );

            if (boResult[entry.param] !== undefined) {
                const bestVal = Math.max(start, Math.min(end, Math.round(boResult[entry.param])));
                bestParams[entry.param] = bestVal;

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
                const finalTrainResult = runStrategyBacktest(trainCandles, strategyType, finalAllData, backtestConfig, indicatorConfig);
                const finalTestResult = runStrategyBacktest(testCandles, strategyType, finalAllData, backtestConfig, indicatorConfig);
                iterations += 2;

                const finalScore = evaluateGeneralizationScore(finalTrainResult.winRate, finalTestResult.winRate);
                if (finalScore > bestScore) {
                    bestScore = finalScore;
                    bestWinRate = finalTestResult.winRate;
                    bestAllData = finalAllData;
                }
            }

            carryForwardAllData = bestAllData;

            if (round === 0) {
                roundResults.push({ param: entry.param, value: bestParams[entry.param], winRate: bestWinRate });
            }
        }
    }

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
    const finalResult = runStrategyBacktest(candles, strategyType, carryForwardAllData, finalConfig, finalIndicatorCfg);
    const finalWinRate = finalResult.winRate;
    const finalProfitFactor = finalResult.profitFactor;

    // Apply optimization constraints: Win Rate or Profit Factor must not degrade below baseline.
    if (finalWinRate < initialWinRate || finalProfitFactor < initialProfitFactor) {
        const fallbackParams: Record<string, number> = {
            lookForward: initialLookForward,
            ...config.initialParams
        };
        for (const ind of indicators) {
            const entry = paramMap[ind];
            if (entry && fallbackParams[entry.param] === undefined) {
                const defaultVal = PARAM_DEFAULTS_NUM[entry.param] ?? entry.range[0];
                fallbackParams[entry.param] = defaultVal;
            }
        }
        return {
            bestParams: sanitizeParams(fallbackParams),
            bestWinRate: initialWinRate,
            iterations,
            roundResults: [
                ...roundResults,
                { param: 'revert_to_initial', value: 1, winRate: initialWinRate }
            ]
        };
    }

    bestWinRate = finalResult.winRate;
    return { bestParams: sanitizeParams(bestParams), bestWinRate, iterations, roundResults };
}
