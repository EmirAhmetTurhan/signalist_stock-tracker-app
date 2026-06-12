// POST /api/analysis/market-telemetry — Market Telemetry Report
// Analyzes price data to identify market regimes (uptrends, downtrends, ranging zones),
// evaluates indicator performance per regime, and returns optimal strategy recommendations.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/better-auth/auth';
import { headers } from 'next/headers';
import { getCandlesForInterval } from '@/lib/actions/finnhub.actions';
import { computeIndicators } from '@/lib/ta';
import { mapComputedToAllData } from '@/lib/ta/strategy-optimizer';
import { classifyRegime } from '@/lib/ta/regime-detector';
import type { RegimeSegment } from '@/lib/ta/regime-detector';
import { evaluateIndicators } from '@/lib/ta/indicator-evaluator';
import { buildRegimeStrategies } from '@/lib/ta/regime-strategy-builder';
import { buildCausalSegments } from '@/lib/ta/telemetry-utils';
import type { Candle } from '@/lib/ta/types';
import type { Timeframe, IndicatorParams } from '@/lib/ta/types';
import { PARAM_DEFAULTS_NUM } from '@/lib/constants/indicator-params';

export async function POST(request: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { symbol, interval, years } = body as {
            symbol?: string;
            interval?: string;
            years?: number;
        };

        if (!symbol || typeof symbol !== 'string' || symbol.trim().length === 0) {
            return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
        }

        const validIntervals = ['1d', '4h'];
        const safeInterval = (validIntervals.includes(interval || '') ? interval! : '1d') as Timeframe;
        const safeYears = typeof years === 'number' && years >= 1 && years <= 10 ? years : 2;

        const candleData = await getCandlesForInterval(
            symbol.toUpperCase(),
            safeInterval,
            safeYears,
        );

        if (!Array.isArray(candleData) || candleData.length === 0) {
            return NextResponse.json(
                { error: `No candle data found for ${symbol.toUpperCase()}` },
                { status: 404 },
            );
        }

        // Convert to CandleInput shape (time: number)
        const candleInputs = candleData.map((c: any) => ({
            time: Number(c.time ?? c.t ?? c.date ?? 0),
            open: Number(c.open ?? 0),
            high: Number(c.high ?? 0),
            low: Number(c.low ?? 0),
            close: Number(c.close ?? 0),
            volume: Number(c.volume ?? 0),
        }));

        // Candle for backtest (time: string|number) 
        const candles: Candle[] = candleData.map((c: any) => ({
            time: c.time ?? c.t ?? c.date ?? '',
            open: Number(c.open ?? 0),
            high: Number(c.high ?? 0),
            low: Number(c.low ?? 0),
            close: Number(c.close ?? 0),
            volume: Number(c.volume ?? 0),
        }));

        // ── Safe limit: guard against Vercel timeout on large datasets (4H ~5000 candles)
        const MAX_CANDLES = 2000;
        const truncated = candleInputs.length > MAX_CANDLES
            ? candleInputs.slice(candleInputs.length - MAX_CANDLES)
            : candleInputs;
        const candleTruncated = candles.length > MAX_CANDLES
            ? candles.slice(candles.length - MAX_CANDLES)
            : candles;

        const allIndicatorKeys = new Set([
            'rsi', 'cci', 'wavetrend', 'macd', 'stochrsi', 'dmi',
            'smi', 'ao', 'mfi', 'wpr', 'di', 'cmf', 'ad',
            'netvol', 'madr', 'alma', 'bb',
        ]);

        const computed = computeIndicators(truncated, allIndicatorKeys, {
            macdFast: PARAM_DEFAULTS_NUM.macd_fast ?? 12,
            macdSlow: PARAM_DEFAULTS_NUM.macd_slow ?? 26,
            macdSig: PARAM_DEFAULTS_NUM.macd_sig ?? 9,
            stochRsiLen: PARAM_DEFAULTS_NUM.stoch_rsi_len ?? 14,
            stochLen: PARAM_DEFAULTS_NUM.stoch_len ?? 14,
            stochK: PARAM_DEFAULTS_NUM.stoch_k ?? 3,
            stochD: PARAM_DEFAULTS_NUM.stoch_d ?? 3,
            wtAvgLen: PARAM_DEFAULTS_NUM.wt_avg_len ?? 21,
            wtChannelLen: PARAM_DEFAULTS_NUM.wt_channel_len ?? 10,
            wtMaLen: PARAM_DEFAULTS_NUM.wt_ma_len ?? 4,
            dmiDiLen: PARAM_DEFAULTS_NUM.dmi_di_len ?? 14,
            dmiAdxSmooth: PARAM_DEFAULTS_NUM.dmi_adx_smooth ?? 14,
            mfiPeriod: PARAM_DEFAULTS_NUM.mfi_period ?? 14,
            smiLongLen: PARAM_DEFAULTS_NUM.smi_long_len ?? 14,
            smiShortLen: PARAM_DEFAULTS_NUM.smi_short_len ?? 3,
            smiSigLen: PARAM_DEFAULTS_NUM.smi_sig_len ?? 3,
            rsiLen: PARAM_DEFAULTS_NUM.rsi_len ?? 14,
            rsiMaLen: PARAM_DEFAULTS_NUM.rsi_ma_len ?? 14,
            cciLen: PARAM_DEFAULTS_NUM.cci_len ?? 20,
            cciMaLen: PARAM_DEFAULTS_NUM.cci_ma_len ?? 14,
            wprLen: PARAM_DEFAULTS_NUM.wpr_len ?? 14,
            diLen: PARAM_DEFAULTS_NUM.di_len ?? 10,
            diSmooth: PARAM_DEFAULTS_NUM.di_smooth ?? 10,
            diK: PARAM_DEFAULTS_NUM.di_k ?? 2,
            cmfLen: PARAM_DEFAULTS_NUM.cmf_len ?? 20,
            adLen: PARAM_DEFAULTS_NUM.ad_len ?? 21,
            madrLen: PARAM_DEFAULTS_NUM.madr_len ?? 21,
            almaLen: PARAM_DEFAULTS_NUM.alma_len ?? 9,
            almaOffset: PARAM_DEFAULTS_NUM.alma_offset ?? 0.85,
            almaSigma: PARAM_DEFAULTS_NUM.alma_sigma ?? 6,
            almaColor: '#ff0', almaOpacity: 1, almaWidth: 2, almaStyle: 1,
            bbLen: PARAM_DEFAULTS_NUM.bb_len ?? 20,
            bbStdDev: PARAM_DEFAULTS_NUM.bb_stddev ?? 2,
            bbOffset: PARAM_DEFAULTS_NUM.bb_offset ?? 0,
            bbColor: '#0ff', bbOpacity: 0.5, bbWidth: 1,
        } as IndicatorParams);
        const allData = mapComputedToAllData(computed);

        // ── Causal Rejim Segmentasyonu (non-causal zigzag YERİNE) ──
        // classifyRegime() sadece geçmiş barları okur → canlı sinyal için güvenli.
        // Ardışık aynı rejime sahip barları gruplayarak causal segment'ler oluşturur.
        const segments = buildCausalSegments(candleTruncated);

        const performances = evaluateIndicators(candleTruncated, allData as any, segments, {
            lookbackBars: 7,
            // Causal segments are typically shorter than non-causal zigzag segments.
            // Lower minSampleSize to 10 so we get meaningful stats even with fewer segments.
            // Beta-Binomial posterior (Beta(1,1) prior) gracefully handles small samples
            // by shrinking toward 0.5 — see indicator-evaluator.ts safety guards.
            minSampleSize: 10,
            confidenceLevel: 0.95,
        });

        const report = buildRegimeStrategies(
            segments,
            performances,
            symbol.toUpperCase(),
            safeInterval,
            // Match evaluateIndicators minSampleSize for consistency
            { minSampleSize: 10 },
        );

        const priceSummary = buildPriceSummary(segments);

        return NextResponse.json({
            ...report,
            priceSummary,
            totalCandles: candles.length,  // original total, not truncated
            truncated: truncated.length < candleInputs.length,
            analysisDate: new Date().toISOString(),
        }, { status: 200 });
    } catch (e) {
        console.error('[MarketTelemetry] Error:', e);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        );
    }
}


interface PriceSummaryItem {
    type: string;
    startDate: string;
    endDate: string;
    durationBars: number;
    priceChange: number;
    priceChangePct: number;
    startPrice: number;
    endPrice: number;
}

function buildPriceSummary(segments: any[]): PriceSummaryItem[] {
    return segments.map((seg: any) => ({
        type: seg.type,
        startDate: seg.startDate,
        endDate: seg.endDate,
        durationBars: seg.durationBars ?? (seg.endIndex - seg.startIndex),
        priceChange: seg.priceChange ?? 0,
        // priceChange already IS a percentage in buildCausalSegments — use it for both fields
        priceChangePct: seg.priceChange ?? 0,
        startPrice: seg.startPrice ?? 0,
        endPrice: seg.endPrice ?? 0,
    }));
}