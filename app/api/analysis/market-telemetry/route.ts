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
import type { Candle } from '@/lib/ta/backtest';
import type { Timeframe } from '@/lib/ta/types';
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
            macdSig: PARAM_DEFAULTS_NUM.macd_signal ?? 9,
            stochRsiLen: PARAM_DEFAULTS_NUM.stochrsi_len ?? 14,
            stochLen: PARAM_DEFAULTS_NUM.stoch_len ?? 3,
            stochK: PARAM_DEFAULTS_NUM.stoch_k ?? 3,
            stochD: PARAM_DEFAULTS_NUM.stoch_d ?? 3,
            wtAvgLen: PARAM_DEFAULTS_NUM.wavetrend_avg_len ?? 10,
            wtChannelLen: PARAM_DEFAULTS_NUM.wavetrend_channel_len ?? 21,
            wtMaLen: PARAM_DEFAULTS_NUM.wavetrend_ma_len ?? 4,
            dmiDiLen: PARAM_DEFAULTS_NUM.dmi_di_len ?? 14,
            dmiAdxSmooth: PARAM_DEFAULTS_NUM.dmi_adx_smooth ?? 14,
            mfiPeriod: PARAM_DEFAULTS_NUM.mfi_period ?? 14,
            smiLongLen: PARAM_DEFAULTS_NUM.smi_long_len ?? 20,
            smiShortLen: PARAM_DEFAULTS_NUM.smi_short_len ?? 5,
            smiSigLen: PARAM_DEFAULTS_NUM.smi_sig_len ?? 5,
            rsiLen: PARAM_DEFAULTS_NUM.rsi_len ?? 14,
            rsiMaLen: PARAM_DEFAULTS_NUM.rsi_ma_len ?? 5,
            cciLen: PARAM_DEFAULTS_NUM.cci_len ?? 20,
            cciMaLen: PARAM_DEFAULTS_NUM.cci_ma_len ?? 5,
            wprLen: PARAM_DEFAULTS_NUM.wpr_len ?? 14,
            diLen: PARAM_DEFAULTS_NUM.di_len ?? 14,
            diSmooth: PARAM_DEFAULTS_NUM.di_smooth ?? 3,
            diK: PARAM_DEFAULTS_NUM.di_k ?? 3,
            cmfLen: PARAM_DEFAULTS_NUM.cmf_len ?? 21,
            madrLen: PARAM_DEFAULTS_NUM.madr_len ?? 14,
            almaLen: PARAM_DEFAULTS_NUM.alma_len ?? 14,
            almaOffset: PARAM_DEFAULTS_NUM.alma_offset ?? 0.85,
            almaSigma: PARAM_DEFAULTS_NUM.alma_sigma ?? 6,
            almaColor: '#ff0', almaOpacity: 1, almaWidth: 2, almaStyle: 1,
            bbLen: PARAM_DEFAULTS_NUM.bb_len ?? 20,
            bbStdDev: PARAM_DEFAULTS_NUM.bb_stddev ?? 2,
            bbOffset: PARAM_DEFAULTS_NUM.bb_offset ?? 0,
            bbColor: '#0ff', bbOpacity: 0.5, bbWidth: 1,
        } as any);
        const allData = mapComputedToAllData(computed);

        // ── Causal Rejim Segmentasyonu (non-causal zigzag YERİNE) ──
        // classifyRegime() sadece geçmiş barları okur → canlı sinyal için güvenli.
        // Ardışık aynı rejime sahip barları gruplayarak causal segment'ler oluşturur.
        const segments = buildCausalSegments(candleTruncated);

        const indicatorData = buildIndicatorDataMap(allData as { [key: string]: unknown });

        const performances = evaluateIndicators(candleTruncated, indicatorData, segments, {
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

function buildIndicatorDataMap(allData: unknown): Record<string, number[]> {
    if (!allData || typeof allData !== 'object') return {};
    const data = allData as Record<string, unknown>;
    const map: Record<string, number[]> = {};

    const extractSeries = (arr: unknown): number[] => {
        if (!Array.isArray(arr)) return [];
        return arr.map((p: { value?: number }) => (typeof p?.value === 'number' && !isNaN(p.value) ? p.value : NaN));
    };

    if (data.rsiData && typeof data.rsiData === 'object') {
        map['rsi'] = extractSeries((data.rsiData as Record<string, unknown>).rsi);
    }
    if (data.cciData && typeof data.cciData === 'object') {
        map['cci'] = extractSeries((data.cciData as Record<string, unknown>).cci);
    }
    if (data.waveTrendData && typeof data.waveTrendData === 'object') {
        map['wavetrend'] = extractSeries((data.waveTrendData as Record<string, unknown>).wt1);
    }
    if (data.macdData && typeof data.macdData === 'object') {
        map['macd'] = extractSeries((data.macdData as Record<string, unknown>).macd);
    }
    if (data.stochRsiData && typeof data.stochRsiData === 'object') {
        map['stochrsi'] = extractSeries((data.stochRsiData as Record<string, unknown>).k);
    }
    if (data.dmiData && typeof data.dmiData === 'object') {
        map['dmi'] = extractSeries((data.dmiData as Record<string, unknown>).adx);
    }
    if (data.aoData) {
        map['ao'] = extractSeries(data.aoData);
    }
    if (data.mfiData && typeof data.mfiData === 'object') {
        map['mfi'] = extractSeries((data.mfiData as Record<string, unknown>).mfi);
    }
    if (data.wprData) {
        map['wpr'] = extractSeries(data.wprData);
    }
    if (data.smiData && typeof data.smiData === 'object') {
        map['smi'] = extractSeries((data.smiData as Record<string, unknown>).smi);
    }
    if (data.diData) {
        map['di'] = extractSeries(data.diData);
    }
    if (data.cmfData) {
        map['cmf'] = extractSeries(data.cmfData);
    }
    if (data.adData) {
        map['ad'] = extractSeries(data.adData);
    }
    if (data.nvData) {
        map['netvol'] = extractSeries(data.nvData);
    }
    if (data.madrData) {
        map['madr'] = extractSeries(data.madrData);
    }
    if (data.almaData) {
        map['alma'] = extractSeries(data.almaData);
    }
    if (data.bbData) {
        map['bb'] = extractSeries(data.bbData);
    }

    return map;
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

/**
 * Build causal regime segments using classifyRegime() instead of
 * the non-causal segmentRegimes() zigzag algorithm.
 *
 * classifyRegime() only reads past bars → safe for live signal use.
 * Consecutive bars with the same regime are grouped into segments.
 */
function buildCausalSegments(candles: Candle[]): RegimeSegment[] {
    if (candles.length < 30) return [];

    // Compute ATR once for all bars
    const atr: number[] = [];
    let sumTR = 0;
    for (let i = 0; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        if (i < 14) { sumTR += tr; atr.push(sumTR / (i + 1)); }
        else if (i === 14) { sumTR += tr; atr.push(sumTR / 14); }
        else { atr.push((atr[i - 1] * 13 + tr) / 14); }
    }

    const segments: RegimeSegment[] = [];
    let segStart = 30; // Skip warmup
    let currentRegime = classifyRegime(candles, segStart, atr);

    for (let i = 31; i < candles.length; i++) {
        const regime = classifyRegime(candles, i, atr);
        if (regime !== currentRegime || i === candles.length - 1) {
            const endIdx = i === candles.length - 1 ? i : i - 1;
            if (endIdx - segStart >= 3) { // Min 3 bars per segment
                const startPrice = candles[segStart].close;
                const endPrice = candles[endIdx].close;
                const priceChangePct = ((endPrice - startPrice) / startPrice) * 100;
                segments.push({
                    startIndex: segStart,
                    endIndex: endIdx,
                    startDate: candles[segStart].time,
                    endDate: candles[endIdx].time,
                    type: currentRegime,
                    priceChange: priceChangePct,
                    priceChangePct,
                    durationBars: endIdx - segStart + 1,
                    confidence: 0.7,
                    startPrice,
                    endPrice,
                });
            }
            segStart = i;
            currentRegime = regime;
        }
    }

    return segments;
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