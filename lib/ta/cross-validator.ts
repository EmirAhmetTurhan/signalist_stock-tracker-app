// lib/ta/cross-validator.ts — K-Fold Cross-Validation
// Phase 5 of the Deep Discovery pipeline.
// Validates Top 10 strategies against out-of-sample data to detect overfitting.
// Assigns risk badges: 🟢 Low, 🟡 Medium, 🔴 High.

import type { Candle } from './backtest';
import type { AllData } from './strategy-optimizer';
import { runStrategyBacktest } from './strategy-optimizer';
import { recomputeAllIndicators, encodeMask } from './ga-optimizer';
import type { GAIndividual } from './ga-optimizer';
import type {
    DiverseStrategy,
    ValidatedStrategy,
    RiskLevel,
} from './discovery-types';
import { RISK_THRESHOLDS, RISK_BADGES } from './discovery-types';

// ─── Configuration ──────────────────────────────────────────────────────────────

/** Number of folds for cross-validation. */
const K_FOLDS = 5;

// ─── Main Cross-Validation Function ─────────────────────────────────────────────

/**
 * K-Fold Cross-Validation — Phase 5 of Deep Discovery.
 *
 * For each strategy in Top 10:
 * 1. Split candles into K equal folds
 * 2. For each fold: train on K-1 folds, test on 1 fold
 * 3. Compute average train/test win rates
 * 4. Calculate overfitting risk = 1 - (avgTestWR / avgTrainWR)
 * 5. Assign risk badge: 🟢 Low (<10%), 🟡 Medium (10-25%), 🔴 High (>25%)
 *
 * @param strategies - Top 10 diverse strategies from Phase 4
 * @param candles - Full candle data
 * @param allData - Pre-computed indicator data
 * @param interval - Data interval ('1d', '4h')
 * @returns ValidatedStrategy[] sorted by validatedWinRate descending
 */
export function crossValidate(
    strategies: DiverseStrategy[],
    candles: Candle[],
    allData: AllData,
    interval: string,
): ValidatedStrategy[] {
    const foldSize = Math.floor(candles.length / K_FOLDS);

    // Need enough candles for meaningful fold sizes
    if (foldSize < 60) {
        // Not enough data for cross-validation — return strategies with default risk
        return strategies.map((s, idx) => ({
            ...s,
            validatedWinRate: s.bestWinRate,
            overfittingRisk: 0,
            riskLevel: 'low' as RiskLevel,
            riskBadge: RISK_BADGES.low,
            avgTrainWinRate: s.bestWinRate,
            rank: idx + 1,
        }));
    }

    const validated: ValidatedStrategy[] = [];

    for (const strategy of strategies) {
        const foldResults: { trainWinRate: number; testWinRate: number }[] = [];

        // Build a temporary GAIndividual for indicator recomputation
        const tempIndividual: GAIndividual = {
            indicatorMask: encodeMask(strategy.combo),
            params: { ...strategy.bestParams },
            lookForward: strategy.bestParams.lookForward ?? 14,
            mode: strategy.mode,
            fitness: 0,
            rawWinRate: 0,
            totalSignals: 0,
            generation: 0,
        };

        // Recompute indicators with optimized params (on full candle set)
        const updatedAllData = recomputeAllIndicators(allData, tempIndividual, candles);

        for (let fold = 0; fold < K_FOLDS; fold++) {
            const testStart = fold * foldSize;
            const testEnd = (fold + 1) * foldSize;

            // Split candles into train and test sets
            const trainCandles = [
                ...candles.slice(0, testStart),
                ...candles.slice(testEnd),
            ];
            const testCandles = candles.slice(testStart, testEnd);

            // Skip fold if either set is too small
            if (trainCandles.length < 60 || testCandles.length < 30) {
                continue;
            }

            const lookForward = strategy.bestParams.lookForward ?? 14;

            // Backtest on TRAIN set
            const trainResult = runStrategyBacktest(
                trainCandles,
                'CUSTOM',
                updatedAllData,
                { lookForward, interval, mode: strategy.mode },
                { customIndicators: strategy.combo, mode: strategy.mode, interval },
            );

            // Backtest on TEST set
            const testResult = runStrategyBacktest(
                testCandles,
                'CUSTOM',
                updatedAllData,
                { lookForward, interval, mode: strategy.mode },
                { customIndicators: strategy.combo, mode: strategy.mode, interval },
            );

            // Only count folds where both sets produced signals
            if (trainResult.totalSignals > 0 && testResult.totalSignals > 0) {
                foldResults.push({
                    trainWinRate: trainResult.winRate,
                    testWinRate: testResult.winRate,
                });
            }
        }

        // Compute averages
        let avgTrainWR: number;
        let avgTestWR: number;
        let overfittingRisk: number;

        if (foldResults.length > 0) {
            avgTrainWR = foldResults.reduce((sum, f) => sum + f.trainWinRate, 0) / foldResults.length;
            avgTestWR = foldResults.reduce((sum, f) => sum + f.testWinRate, 0) / foldResults.length;
            overfittingRisk = avgTrainWR > 0
                ? Math.max(0, 1.0 - (avgTestWR / avgTrainWR))
                : 0;
        } else {
            // No valid folds — cannot validate, use original winRate
            avgTrainWR = strategy.bestWinRate;
            avgTestWR = strategy.bestWinRate;
            overfittingRisk = 0;
        }

        // Classify risk level
        let riskLevel: RiskLevel;
        if (overfittingRisk < RISK_THRESHOLDS.low) {
            riskLevel = 'low';
        } else if (overfittingRisk < RISK_THRESHOLDS.medium) {
            riskLevel = 'medium';
        } else {
            riskLevel = 'high';
        }

        validated.push({
            ...strategy,
            validatedWinRate: avgTestWR,
            overfittingRisk,
            riskLevel,
            riskBadge: RISK_BADGES[riskLevel],
            avgTrainWinRate: avgTrainWR,
            rank: 0, // Will be set after sorting
        });
    }

    // Sort by validatedWinRate descending and assign ranks
    validated.sort((a, b) => b.validatedWinRate - a.validatedWinRate);
    validated.forEach((v, idx) => { v.rank = idx + 1; });

    return validated;
}
