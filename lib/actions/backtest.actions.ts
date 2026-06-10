'use server';

import { runStrategyBacktest, mapComputedToAllData } from '@/lib/ta/strategy-optimizer';
import type { StrategyBacktestResult } from '@/lib/ta/strategy-optimizer';
import type { Candle } from '@/lib/ta/simulation/backtest';
import { computeIndicators } from '@/lib/ta/compute';
import { PARAM_DEFAULTS_NUM } from '@/lib/constants/indicator-params';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { getCandlesForInterval } from '@/lib/actions/finnhub.actions';
import type { Timeframe, CandleInput } from '@/lib/ta/types';

/**
 * Server action: Run full strategy backtest using the DST fusion + path-aware engine.
 * Fetches candle data and computes indicators server-side for payload optimization and security.
 */
export async function runBacktestAction(
    symbol: string,
    strategyName: string,
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
        parameterOverrides?: Record<string, number>;
    }
): Promise<StrategyBacktestResult> {
    // ─── Better Auth Security Gate ──────────────────────────────────────────
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
        throw new Error('Unauthorized');
    }

    if (!symbol) {
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

    try {
        const interval = (config?.interval ?? '1d') as Timeframe;
        // Fetch up to 10 years of candles server-side
        const rawCandles = await getCandlesForInterval(symbol, interval, 3650);
        if (!rawCandles || rawCandles.length === 0) {
            throw new Error(`No candles found for symbol ${symbol}`);
        }

        const candles: Candle[] = rawCandles.map(c => ({
            time: Number(c.time),
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume ?? 0
        }));

        const mergedParams = { ...PARAM_DEFAULTS_NUM, ...config?.parameterOverrides };
        const ip = {
            macdFast: Number(mergedParams.macd_fast ?? 12),
            macdSlow: Number(mergedParams.macd_slow ?? 26),
            macdSig: Number(mergedParams.macd_sig ?? 9),
            stochRsiLen: Number(mergedParams.stoch_rsi_len ?? 14),
            stochLen: Number(mergedParams.stoch_len ?? 14),
            stochK: Number(mergedParams.stoch_k ?? 3),
            stochD: Number(mergedParams.stoch_d ?? 3),
            wtAvgLen: Number(mergedParams.wt_avg_len ?? 10),
            wtChannelLen: Number(mergedParams.wt_channel_len ?? 21),
            wtMaLen: Number(mergedParams.wt_ma_len ?? 4),
            dmiDiLen: Number(mergedParams.dmi_di_len ?? 14),
            dmiAdxSmooth: Number(mergedParams.dmi_adx_smooth ?? 14),
            mfiPeriod: Number(mergedParams.mfi_period ?? 14),
            smiLongLen: Number(mergedParams.smi_long_len ?? 14),
            smiShortLen: Number(mergedParams.smi_short_len ?? 3),
            smiSigLen: Number(mergedParams.smi_sig_len ?? 3),
            rsiLen: Number(mergedParams.rsi_len ?? 14),
            rsiMaLen: Number(mergedParams.rsi_ma_len ?? 14),
            cciLen: Number(mergedParams.cci_len ?? 20),
            cciMaLen: Number(mergedParams.cci_ma_len ?? 14),
            wprLen: Number(mergedParams.wpr_len ?? 14),
            diLen: Number(mergedParams.di_len ?? 10),
            diSmooth: Number(mergedParams.di_smooth ?? 10),
            diK: Number(mergedParams.di_k ?? 2),
            cmfLen: Number(mergedParams.cmf_len ?? 20),
            adLen: Number(mergedParams.ad_len ?? 21),
            madrLen: Number(mergedParams.madr_len ?? 21),
            almaLen: Number(mergedParams.alma_len ?? 9),
            almaOffset: Number(mergedParams.alma_offset ?? 0.85),
            almaSigma: Number(mergedParams.alma_sigma ?? 6),
            almaColor: '#fbbf24',
            almaOpacity: 100,
            almaWidth: 2,
            almaStyle: 0,
            bbLen: Number(mergedParams.bb_len ?? 20),
            bbStdDev: Number(mergedParams.bb_stddev ?? 2),
            bbOffset: Number(mergedParams.bb_offset ?? 0),
            bbColor: '#3b82f6',
            bbOpacity: 100,
            bbWidth: 1,
        };

        const activeIndicators = new Set<string>();
        if (strategyName === 'RSI_CCI_WT') {
            activeIndicators.add('rsi');
            activeIndicators.add('cci');
            activeIndicators.add('wavetrend');
        } else if (config?.customIndicators) {
            config.customIndicators.forEach(ind => activeIndicators.add(ind));
        }

        const candleInputs: CandleInput[] = candles.map(c => ({
            time: Number(c.time),
            open: c.open ?? c.close,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume ?? 0
        }));
        const computed = computeIndicators(candleInputs, activeIndicators, ip);
        const effectiveAllData = mapComputedToAllData(computed);

        const result = runStrategyBacktest(
            candles,
            strategyName,
            effectiveAllData,
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