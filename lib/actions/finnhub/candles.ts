import 'server-only';

import type { UTCTimestamp } from 'lightweight-charts';
import { fetchJSON, FINNHUB_BASE_URL } from './base';

// ─── Yahoo Finance v8 chart API types ──────────────────────────────────────

interface YahooChartQuote {
    open?: Array<number | null>;
    high?: Array<number | null>;
    low?: Array<number | null>;
    close?: Array<number | null>;
    volume?: Array<number | null>;
}

interface YahooChartResult {
    timestamp?: number[];
    indicators?: { quote?: YahooChartQuote[] };
}

interface YahooChartResponse {
    chart?: {
        result?: YahooChartResult[];
        error?: unknown;
    };
}

/** Parse Yahoo Finance v8 chart timestamps + quote into CandleDataPoint array. */
function parseCandleResponse(
    timestamps: number[],
    quote: YahooChartQuote,
): CandleDataPoint[] {
    const { open: opens, high: highs, low: lows, close: closes, volume: volumes } = quote;
    const out: CandleDataPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
        const oRaw = opens?.[i]; const hRaw = highs?.[i]; const lRaw = lows?.[i];
        const cRaw = closes?.[i]; const vRaw = volumes?.[i];
        const valid = [oRaw, hRaw, lRaw, cRaw].every(
            (x) => typeof x === 'number' && Number.isFinite(x) && (x as number) > 0,
        );
        if (!valid) continue;
        const o = oRaw as number, h = hRaw as number, l = lRaw as number, c = cRaw as number;
        if (!(l <= h)) continue;
        const item: CandleDataPoint = { time: timestamps[i] as UTCTimestamp, open: o, high: h, low: l, close: c };
        if (typeof vRaw === 'number' && Number.isFinite(vRaw) && vRaw >= 0) item.volume = vRaw as number;
        out.push(item);
    }
    return out;
}

export async function getDailyCandles(symbol: string, days = 180): Promise<CandleDataPoint[]> {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;

    // 1) Try Yahoo Finance first — no API key, no rate limits, 10+ years of data
    try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${from}&period2=${to}`;
        const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
        const res = await fetch(yahooUrl, { cache: 'force-cache', next: { revalidate: 600 }, headers });
        if (!res.ok) throw new Error(`Yahoo chart fetch failed: ${res.status}`);
        const json: YahooChartResponse = await res.json();
        const result = json?.chart?.result?.[0];
        const ts: number[] | undefined = result?.timestamp;
        const quote = result?.indicators?.quote?.[0] || {};
        const opens: Array<number | null> | undefined = quote.open;
        const highs: Array<number | null> | undefined = quote.high;
        const lows: Array<number | null> | undefined = quote.low;
        const closes: Array<number | null> | undefined = quote.close;
        const volumes: Array<number | null> | undefined = quote.volume;
        if (Array.isArray(ts) && ts.length) {
            const out: CandleDataPoint[] = [];
            for (let i = 0; i < ts.length; i++) {
                const oRaw = opens?.[i];
                const hRaw = highs?.[i];
                const lRaw = lows?.[i];
                const cRaw = closes?.[i];
                const vRaw = volumes?.[i];

                const valid = [oRaw, hRaw, lRaw, cRaw].every(
                    (x) => typeof x === 'number' && Number.isFinite(x) && (x as number) > 0
                );
                if (!valid) continue;

                const o = oRaw as number;
                const h = hRaw as number;
                const l = lRaw as number;
                const c = cRaw as number;
                if (!(l <= h)) continue;

                const item: CandleDataPoint = { time: ts[i] as UTCTimestamp, open: o, high: h, low: l, close: c };
                if (typeof vRaw === 'number' && Number.isFinite(vRaw) && vRaw >= 0) item.volume = vRaw as number;
                out.push(item);
            }
            if (out.length > 0) return out;
        }
    } catch (e) {
        console.error('getDailyCandles Yahoo error', e);
        // fall through to Finnhub
    }

    // 2) Fallback to Finnhub (requires API key)
    try {
        const token = process.env.FINNHUB_API_KEY;
        if (token) {
            const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${token}`;
            type CandleResponse = { s: 'ok' | string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] };
            const data = await fetchJSON<CandleResponse>(url, 600);
            if (data && data.s === 'ok' && Array.isArray(data.t) && data.t.length > 0) {
                const out: CandleDataPoint[] = [];
                for (let i = 0; i < data.t.length; i++) {
                    const oRaw = data.o?.[i];
                    const hRaw = data.h?.[i];
                    const lRaw = data.l?.[i];
                    const cRaw = data.c?.[i];
                    const vRaw = data.v?.[i];

                    const valid = [oRaw, hRaw, lRaw, cRaw].every(
                        (x) => typeof x === 'number' && Number.isFinite(x) && x > 0
                    );
                    if (!valid) continue;

                    const o = oRaw as number;
                    const h = hRaw as number;
                    const l = lRaw as number;
                    const c = cRaw as number;
                    if (!(l <= h)) continue;

                    const item: CandleDataPoint = {
                        time: data.t[i] as UTCTimestamp,
                        open: o,
                        high: h,
                        low: l,
                        close: c,
                    };
                    if (typeof vRaw === 'number' && Number.isFinite(vRaw) && vRaw >= 0) item.volume = vRaw as number;
                    out.push(item);
                }
                if (out.length > 0) return out;
            }
        }
    } catch (e) {
        console.error('getDailyCandles Finnhub fallback error', e);
    }

    return [];
}

// ─── Yahoo 1h → 4H aggregation ─────────────────────────────────────────────

async function fetchYahoo1hAndAggregate(symbol: string, from: number, to: number): Promise<CandleDataPoint[] | null> {
    const rangeAttempts = [
        60 * 24 * 60 * 60,  // 60 days
        30 * 24 * 60 * 60,  // 30 days
        7 * 24 * 60 * 60,   // 7 days
        3 * 24 * 60 * 60,   // 3 days
    ];

    for (const rangeSec of rangeAttempts) {
        try {
            const adjustedFrom = Math.max(from, to - rangeSec);
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&period1=${adjustedFrom}&period2=${to}`;
            const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
            const res = await fetch(yahooUrl, { cache: 'force-cache', next: { revalidate: 600 }, headers });
            if (!res.ok) {
                console.error(`[Yahoo1h] ${symbol}: status ${res.status} for ${rangeSec / 86400}d range`);
                continue;
            }

            const json: YahooChartResponse = await res.json();
            const result = json?.chart?.result?.[0];
            const ts: number[] | undefined = result?.timestamp;
            const quote = result?.indicators?.quote?.[0] || {};
            const opens: Array<number | null> | undefined = quote.open;
            const highs: Array<number | null> | undefined = quote.high;
            const lows: Array<number | null> | undefined = quote.low;
            const closes: Array<number | null> | undefined = quote.close;
            const volumes: Array<number | null> | undefined = quote.volume;

            if (!Array.isArray(ts) || ts.length === 0) continue;

            const hourlyCandles: CandleDataPoint[] = [];
            for (let i = 0; i < ts.length; i++) {
                const oRaw = opens?.[i];
                const hRaw = highs?.[i];
                const lRaw = lows?.[i];
                const cRaw = closes?.[i];
                const vRaw = volumes?.[i];

                const valid = [oRaw, hRaw, lRaw, cRaw].every(
                    (x) => typeof x === 'number' && Number.isFinite(x) && (x as number) > 0
                );
                if (!valid) continue;

                const o = oRaw as number;
                const h = hRaw as number;
                const l = lRaw as number;
                const c = cRaw as number;
                if (!(l <= h)) continue;

                const item: CandleDataPoint = { time: ts[i] as UTCTimestamp, open: o, high: h, low: l, close: c };
                if (typeof vRaw === 'number' && Number.isFinite(vRaw) && vRaw >= 0) item.volume = vRaw as number;
                hourlyCandles.push(item);
            }

            if (hourlyCandles.length === 0) continue;

            const SESSION_GAP_THRESHOLD = 4 * 3600;

            const sessions: CandleDataPoint[][] = [];
            let currentSession: CandleDataPoint[] = [hourlyCandles[0]];

            for (let i = 1; i < hourlyCandles.length; i++) {
                const gap = hourlyCandles[i].time - hourlyCandles[i - 1].time;
                if (gap > SESSION_GAP_THRESHOLD) {
                    if (currentSession.length > 0) {
                        sessions.push(currentSession);
                    }
                    currentSession = [];
                }
                currentSession.push(hourlyCandles[i]);
            }
            if (currentSession.length > 0) {
                sessions.push(currentSession);
            }

            const fourHourCandles: CandleDataPoint[] = [];
            for (const session of sessions) {
                for (let i = 0; i < session.length; i += 4) {
                    const chunk = session.slice(i, i + 4);
                    if (chunk.length === 0) continue;
                    fourHourCandles.push({
                        time: chunk[0].time,
                        open: chunk[0].open,
                        high: Math.max(...chunk.map(x => x.high)),
                        low: Math.min(...chunk.map(x => x.low)),
                        close: chunk[chunk.length - 1].close,
                        volume: chunk.reduce((acc, curr) => acc + (curr.volume || 0), 0),
                    });
                }
            }

            console.log(`[Yahoo1h] ${symbol}: ${fourHourCandles.length} 4H bars from ${rangeSec / 86400}d of 1h data`);
            return fourHourCandles;
        } catch (e) {
            console.error(`[Yahoo1h] ${symbol}: error for ${rangeSec / 86400}d range:`, e);
            continue;
        }
    }

    console.error(`[Yahoo1h] ${symbol}: all range attempts failed`);
    return null;
}

/** Split a daily candle into two synthetic 4H bars with realistic OHLC distribution. */
function splitDailyInto4H(daily: CandleDataPoint): CandleDataPoint[] {
    const { open, high, low, close, volume, time } = daily;
    const totalVol = volume ?? 0;
    const direction = close >= open ? 1 : -1;
    const absMove = Math.abs(close - open);

    const mid = open + direction * absMove * 0.62;

    if (direction > 0) {
        return [
            {
                time,
                open,
                high: Math.max(open, mid),
                low,
                close: mid,
                volume: Math.round(totalVol * 0.55),
            },
            {
                time: (time + 4 * 3600) as UTCTimestamp,
                open: mid,
                high,
                low: Math.min(mid, close),
                close,
                volume: totalVol - Math.round(totalVol * 0.55),
            },
        ];
    } else {
        return [
            {
                time,
                open,
                high,
                low: Math.min(open, mid),
                close: mid,
                volume: Math.round(totalVol * 0.55),
            },
            {
                time: (time + 4 * 3600) as UTCTimestamp,
                open: mid,
                high: Math.max(mid, close),
                low,
                close,
                volume: totalVol - Math.round(totalVol * 0.55),
            },
        ];
    }
}

export async function get4HourCandles(symbol: string, days = 3650): Promise<CandleDataPoint[]> {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;

    const yahoo4H = await fetchYahoo1hAndAggregate(symbol, from, to);

    if (yahoo4H && yahoo4H.length > 0) {
        const earliestYahooTime = yahoo4H[0].time;

        if (earliestYahooTime <= from + 86400) {
            console.log(`[4H] ${symbol}: ${yahoo4H.length} bars from Yahoo only`);
            return yahoo4H;
        }

        const gapDays = Math.ceil((earliestYahooTime - from) / 86400);
        const olderCandles: CandleDataPoint[] = [];

        try {
            const dailyData = await getDailyCandles(symbol, gapDays + 30);
            const filteredDaily = dailyData.filter((c) => c.time < earliestYahooTime);

            for (const daily of filteredDaily) {
                const [bar1, bar2] = splitDailyInto4H(daily);
                olderCandles.push(bar1, bar2);
            }
        } catch (e) {
            console.error('get4HourCandles daily fallback error', e);
        }

        if (olderCandles.length > 0) {
            const lastOldTime = olderCandles[olderCandles.length - 1].time;
            const filteredYahoo = yahoo4H.filter(c => c.time > lastOldTime);
            console.log(`[4H] ${symbol}: ${olderCandles.length} synthetic + ${filteredYahoo.length} Yahoo bars`);
            if (olderCandles.length > 0 && filteredYahoo.length > 0) {
                const lastSynth = olderCandles[olderCandles.length - 1];
                const firstYahoo = filteredYahoo[0];
                const priceGap = Math.abs(lastSynth.close - firstYahoo.close);
                if (priceGap > 50) {
                    console.warn(`[4H] ${symbol}: PRICE DISCONTINUITY at merge: synthetic=${lastSynth.close} yahoo=${firstYahoo.close} (gap=${priceGap.toFixed(2)})`);
                }
            }
            return [...olderCandles, ...filteredYahoo];
        }

        return yahoo4H;
    }

    const olderCandles: CandleDataPoint[] = [];
    try {
        const dailyData = await getDailyCandles(symbol, days);
        for (const daily of dailyData) {
            olderCandles.push(...splitDailyInto4H(daily));
        }
    } catch (e) {
        console.error('get4HourCandles full daily fallback error', e);
    }

    console.log(`[4H] ${symbol}: Yahoo FAILED, using ONLY synthetic data: ${olderCandles.length} bars`);
    return olderCandles;
}

export async function getYahooIntradayCandles(symbol: string, days = 2): Promise<CandleDataPoint[]> {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;

    try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&period1=${from}&period2=${to}`;
        const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
        const res = await fetch(yahooUrl, { cache: 'force-cache', next: { revalidate: 300 }, headers });
        if (!res.ok) throw new Error(`Yahoo 5m fetch failed: ${res.status}`);

        const json: YahooChartResponse = await res.json();
        const result = json?.chart?.result?.[0];
        const ts: number[] | undefined = result?.timestamp;
        const quote = result?.indicators?.quote?.[0] || {};
        const opens: Array<number | null> | undefined = quote.open;
        const highs: Array<number | null> | undefined = quote.high;
        const lows: Array<number | null> | undefined = quote.low;
        const closes: Array<number | null> | undefined = quote.close;
        const volumes: Array<number | null> | undefined = quote.volume;

        if (Array.isArray(ts) && ts.length) {
            const out: CandleDataPoint[] = [];
            for (let i = 0; i < ts.length; i++) {
                const oRaw = opens?.[i];
                const hRaw = highs?.[i];
                const lRaw = lows?.[i];
                const cRaw = closes?.[i];
                const vRaw = volumes?.[i];

                const valid = [oRaw, hRaw, lRaw, cRaw].every(
                    (x) => typeof x === 'number' && Number.isFinite(x) && (x as number) > 0
                );
                if (!valid) continue;

                const o = oRaw as number;
                const h = hRaw as number;
                const l = lRaw as number;
                const c = cRaw as number;
                if (!(l <= h)) continue;

                const item: CandleDataPoint = { time: ts[i] as UTCTimestamp, open: o, high: h, low: l, close: c };
                if (typeof vRaw === 'number' && Number.isFinite(vRaw) && vRaw >= 0) item.volume = vRaw as number;
                out.push(item);
            }
            if (out.length > 0) return out;
        }
    } catch (e) {
        console.error('getYahooIntradayCandles error', e);
    }

    return [];
}

export async function getDailyCandlesForAI(symbol: string, days = 365): Promise<CandleDataPoint[]> {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;

    try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${from}&period2=${to}`;
        const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
        const res = await fetch(yahooUrl, { cache: 'force-cache', next: { revalidate: 600 }, headers });
        if (!res.ok) throw new Error(`Yahoo chart fetch failed: ${res.status}`);
        const json: YahooChartResponse = await res.json();
        const result = json?.chart?.result?.[0];
        const ts: number[] | undefined = result?.timestamp;
        const quote = result?.indicators?.quote?.[0] || {};
        const opens: Array<number | null> | undefined = quote.open;
        const highs: Array<number | null> | undefined = quote.high;
        const lows: Array<number | null> | undefined = quote.low;
        const closes: Array<number | null> | undefined = quote.close;
        const volumes: Array<number | null> | undefined = quote.volume;
        if (Array.isArray(ts) && ts.length) {
            const out: CandleDataPoint[] = [];
            for (let i = 0; i < ts.length; i++) {
                const oRaw = opens?.[i];
                const hRaw = highs?.[i];
                const lRaw = lows?.[i];
                const cRaw = closes?.[i];
                const vRaw = volumes?.[i];

                const valid = [oRaw, hRaw, lRaw, cRaw].every(
                    (x) => typeof x === 'number' && Number.isFinite(x) && (x as number) > 0
                );
                if (!valid) continue;

                const o = oRaw as number;
                const h = hRaw as number;
                const l = lRaw as number;
                const c = cRaw as number;
                if (!(l <= h)) continue;

                const item: CandleDataPoint = { time: ts[i] as UTCTimestamp, open: o, high: h, low: l, close: c };
                if (typeof vRaw === 'number' && Number.isFinite(vRaw) && vRaw >= 0) item.volume = vRaw as number;
                out.push(item);
            }
            if (out.length > 0) return out;
        }
    } catch (e) {
        console.error('getDailyCandlesForAI error', e);
    }

    return [];
}

export async function getCandlesForInterval(
    symbol: string,
    interval: string,
    days: number
): Promise<CandleDataPoint[]> {
    const { assertAllowedTimeframe } = await import('@/lib/ta/timeframe-guard');
    assertAllowedTimeframe(interval, 'finnhub.getCandlesForInterval');

    switch (interval) {
        case '4h':
            return get4HourCandles(symbol, days);
        case '1d':
        default:
            return getDailyCandles(symbol, days);
    }
}
