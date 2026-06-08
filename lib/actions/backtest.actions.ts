'use server';

import { runStrategyBacktest } from '@/lib/ta/strategy-optimizer';
import type { AllData, StrategyBacktestResult } from '@/lib/ta/strategy-optimizer';
import type { Candle } from '@/lib/ta/backtest';

/**
 * Server action: Run full strategy backtest using the DST fusion + path-aware engine.
 * Returns winRate, totalSignals, wins, history with MFE/MAE/exitReason, and portfolio simulation.
 */
export async function runBacktestAction(
    candles: Candle[],
    strategyName: string,
    allData: AllData,
    config?: {
        lookForward?: number;
        interval?: string;
        customIndicators?: string[];
        mode?: 'all' | 'majority';
        signalProfile?: 'TrendFollower' | 'SwingTrader' | 'Aggressive' | 'Balanced' | 'Conservative';
        evaluationMode?: 'lookforward' | 'pathaware' | 'regime';
        portfolioConfig?: {
            initialCapital: number;
            positionSizePct: number;
            commissionBps: number;
            slippageBps: number;
            allowCompounding: boolean;
        };
    }
): Promise<StrategyBacktestResult> {
    if (!candles || candles.length === 0) {
        return {
            winRate: 0, totalSignals: 0, wins: 0, history: [],
            profitFactor: 0, sharpeRatio: 0, avgWin: 0, avgLoss: 0,
            maxDrawdown: 0, totalReturn: 0,
            regimeBreakdown: {
                uptrend: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
                downtrend: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
                ranging: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
                volatile: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
                neutral: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            },
        };
    }

    const isCustom = strategyName === 'CUSTOM' && config?.customIndicators && config.customIndicators.length > 0;

    try {
        const result = runStrategyBacktest(
            candles,
            strategyName,
            allData,
            {
                lookForward: config?.lookForward ?? 5,
                interval: config?.interval ?? '1d',
                signalProfile: config?.signalProfile ?? 'TrendFollower',
                evaluationMode: config?.evaluationMode ?? 'pathaware',
                portfolioConfig: config?.portfolioConfig ? {
                    ...config.portfolioConfig,
                    commissionBps: config.portfolioConfig.commissionBps ?? 0,
                    slippageBps: config.portfolioConfig.slippageBps ?? 0,
                } : undefined,
            },
            {
                customIndicators: config?.customIndicators,
                mode: config?.mode ?? 'majority',
                interval: config?.interval ?? '1d',
            }
        );
        return result;
    } catch (error) {
        console.error('[backtest] Failed:', error);
        return {
            winRate: 0, totalSignals: 0, wins: 0, history: [],
            profitFactor: 0, sharpeRatio: 0, avgWin: 0, avgLoss: 0,
            maxDrawdown: 0, totalReturn: 0,
            regimeBreakdown: {
                uptrend: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
                downtrend: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
                ranging: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
                volatile: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
                neutral: { winRate: 0, totalSignals: 0, wins: 0, avgReturn: 0, totalReturn: 0 },
            },
        };
    }
}