'use server';

import { connectToDatabase } from '@/database/mongoose';
import SavedStrategy from '@/database/models/saved-strategy.model';
import { StrategyMeta } from '@/database/models/strategy-meta.model';
import { discoverStrategy, DISCOVERY_POOL } from '@/lib/ta/strategy-optimizer';
import type { AllData, DiscoveryResult } from '@/lib/ta/strategy-optimizer';
import type { Candle } from '@/lib/ta/backtest';
import type { StrategyMode } from '@/lib/ta/types';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';

/**
 * Extended result that includes MongoDB IDs for auto-saved strategies.
 */
export interface DiscoveryResultWithSaved extends DiscoveryResult {
    savedStrategyIds: string[];
}

/**
 * Generates a human-readable strategy name from indicator keys.
 */
function generateStrategyName(indicators: string[]): string {
    const labelMap: Record<string, string> = {
        rsi: 'RSI', cci: 'CCI', wavetrend: 'WaveTrend', macd: 'MACD',
        stochrsi: 'StochRSI', dmi: 'DMI', smi: 'SMI', ao: 'AO',
        mfi: 'MFI', wpr: 'WPR', di: 'DI', cmf: 'CMF', ad: 'A/D',
        netvol: 'NetVol', madr: 'MADR', alma: 'ALMA', bb: 'BB',
    };
    return indicators.map(k => labelMap[k] ?? k.toUpperCase()).join(' + ');
}

/**
 * Server action: Run the 3-phase Strategy Discovery Engine.
 * Takes pre-computed candles + AllData, tries all 2-to-5 indicator combinations,
 * quick-screens with default params, then fully optimizes top candidates.
 * Returns the best strategies ranked by win rate.
 *
 * Auto-saves the top 5 discovered strategies to MongoDB if a userId is provided.
 */
export async function discoverStrategyAction(
    candles: Candle[],
    allData: AllData,
    options?: {
        indicatorPool?: string[];
        minIndicators?: number;
        maxIndicators?: number;
        interval?: string;
        mode?: StrategyMode;
        topN?: number;
        /** If provided, discovered strategies are auto-saved to MongoDB */
        userId?: string;
    }
): Promise<DiscoveryResultWithSaved> {
    // ── Timeframe Isolation Guard ──────────────────────────────────
    const { assertAllowedTimeframe } = await import('@/lib/ta/timeframe-guard');
    const effectiveInterval = assertAllowedTimeframe(options?.interval ?? '1d', 'discoverStrategyAction');

    if (!candles || candles.length === 0 || !allData) {
        return {
            best: { indicators: [], params: {}, winRate: 0, totalSignals: 0, rank: 1 },
            all: [],
            totalCombinationsTested: 0,
            poolSize: 0,
            savedStrategyIds: [],
        };
    }

    try {
        const result = discoverStrategy(candles, allData, {
            indicatorPool: options?.indicatorPool ?? DISCOVERY_POOL,
            minIndicators: options?.minIndicators ?? 2,
            maxIndicators: options?.maxIndicators ?? 5,
            interval: effectiveInterval,
            mode: options?.mode ?? 'all',
            topN: options?.topN ?? 5,
        });

        // ── Auto-save top 5 strategies to MongoDB ──
        const savedStrategyIds: string[] = [];
        const userId = options?.userId;

        if (userId && result.all.length > 0) {
            try {
                await connectToDatabase();

                const topN = result.all.slice(0, 5);
                for (const ds of topN) {
                    const saved = await SavedStrategy.create({
                        userId,
                        name: `📊 ${generateStrategyName(ds.indicators)}`,
                        indicators: ds.indicators,
                        mode: options?.mode ?? 'all',
                        lookForward: Math.round(ds.params.lookForward ?? 14),
                        discoveredParams: ds.params,
                        discoveredWinRate: ds.winRate,
                        discoveredTotalSignals: ds.totalSignals,
                        discoveredSymbol: (candles as any)[0]?.symbol ?? null,
                        discoveredInterval: options?.interval ?? '1d',
                        // Multi-metric discovery fields
                        discoveredProfitFactor: ds.profitFactor ?? null,
                        discoveredSharpeRatio: ds.sharpeRatio ?? null,
                        discoveredAvgWin: ds.avgWin ?? null,
                        discoveredAvgLoss: ds.avgLoss ?? null,
                        discoveredMaxDrawdown: ds.maxDrawdown ?? null,
                        discoveredTotalReturn: ds.totalReturn ?? null,
                        discoveredRegimeBreakdown: ds.regimeBreakdown ?? null,
                        isDiscovered: true,
                        pinned: false,
                    });
                    savedStrategyIds.push(saved._id.toString());

                    // ── Bayesian Meta-Learning: save/update StrategyMeta ──
                    try {
                        const hash = createHash('md5').update(ds.indicators.sort().join(',')).digest('hex');
                        await StrategyMeta.findOneAndUpdate(
                            { indicatorHash: hash },
                            {
                                $set: {
                                    parameters: ds.params,
                                    lastUpdated: new Date(),
                                },
                                $setOnInsert: {
                                    regimeBreakdown: [
                                        { regime: 'uptrend', alpha: 1, beta: 1, tradesCount: 0, lastUpdated: new Date() },
                                        { regime: 'downtrend', alpha: 1, beta: 1, tradesCount: 0, lastUpdated: new Date() },
                                        { regime: 'ranging', alpha: 1, beta: 1, tradesCount: 0, lastUpdated: new Date() },
                                        { regime: 'volatile', alpha: 1, beta: 1, tradesCount: 0, lastUpdated: new Date() },
                                        { regime: 'neutral', alpha: 1, beta: 1, tradesCount: 0, lastUpdated: new Date() },
                                    ],
                                },
                            },
                            { upsert: true }
                        );
                    } catch (metaError) {
                        // Don't fail the whole request if meta-save fails
                        console.error('[discover-strategy] Meta-save failed:', metaError);
                    }
                }

                revalidatePath('/ta');
            } catch (dbError) {
                // Don't fail the whole request if auto-save fails
                console.error('[discover-strategy] Auto-save failed:', dbError);
            }
        }

        return {
            ...result,
            savedStrategyIds,
        };
    } catch (error) {
        console.error('[discover-strategy] Discovery engine failed:', error);
        return {
            best: { indicators: [], params: {}, winRate: 0, totalSignals: 0, rank: 1 },
            all: [],
            totalCombinationsTested: 0,
            poolSize: 0,
            savedStrategyIds: [],
        };
    }
}
