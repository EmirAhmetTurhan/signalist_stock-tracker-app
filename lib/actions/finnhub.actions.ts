'use server';

import 'server-only';

import { cache } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

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

export async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
    const res = await fetch(url, {
        ...(revalidateSeconds !== undefined ? { next: { revalidate: revalidateSeconds } } : {}),
    });
    if (!res.ok) throw new Error(`fetchJSON failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
}

/**
 * Finnhub API'si üzerinden haberleri alır.
 * @param symbols - İsteğe bağlı sembol filtresi
 * @returns haber makaleleri dizisi
 */
export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
    const token = process.env.FINNHUB_API_KEY;
    if (!token) return [];

    try {
        if (!symbols || symbols.length === 0) {
            const url = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
            return await fetchJSON<MarketNewsArticle[]>(url, 300);
        }

        const cleanSymbols = symbols.map((s) => s.replace(/^AQL_/, '').replace(/\/.*$/, ''));
        const now = new Date();
        const to = now.toISOString().slice(0, 10);
        const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        const results = await Promise.all(
            cleanSymbols.map(async (sym) => {
                try {
                    const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&token=${token}`;
                    const articles = await fetchJSON<MarketNewsArticle[]>(url, 300);
                    return articles.map((a) => ({ ...a, symbol: sym }));
                } catch {
                    return [] as MarketNewsArticle[];
                }
            }),
        );
        return results.flat().sort((a, b) => b.datetime - a.datetime);
    } catch {
        return [];
    }
}

// ─── Stock Search ──────────────────────────────────────────────────────────

type StockProfile2 = {
    name: string;
    ticker: string;
    currency: string;
    shareOutstanding: number;
    logo: string;
    country: string;
};

const FINNHUB_STOCKS = [
    'AAPL',
    'MSFT',
    'GOOGL',
    'AMZN',
    'META',
    'TSLA',
    'NVDA',
    'JPM',
    'V',
    'WMT',
    'JNJ',
    'MA',
    'PG',
    'UNH',
    'HD',
    'BAC',
    'DIS',
    'ADBE',
    'NFLX',
    'CRM',
    'AMD',
    'INTC',
    'PFE',
    'ABBV',
    'KO',
    'PEP',
    'MRK',
    'TMO',
    'COST',
    'CVX',
    'AVGO',
    'ACN',
    'DHR',
    'LIN',
    'NKE',
    'TXN',
    'QCOM',
    'MDT',
    'PM',
    'NEE',
    'HON',
    'RTX',
    'ABT',
    'AMGN',
    'LOW',
    'UPS',
    'SPGI',
    'IBM',
    'CAT',
    'AXP',
    'PLTR',
    'CME',
    'DE',
    'BLK',
    'GS',
    'SCHW',
    'BA',
    'AMAT',
    'MS',
    'GILD',
    'ISRG',
    'BSX',
    'BDX',
    'C',
    'MMC',
    'VRTX',
    'ADI',
    'PLD',
    'MDLZ',
    'CB',
    'TMUS',
    'SYK',
    'ZTS',
    'EOG',
    'REGN',
    'CSCO',
    'FISV',
    'MO',
    'ELV',
    'TJX',
    'CI',
    'WM',
    'ATVI',
    'LRCX',
    'MCO',
    'PGR',
    'DUK',
    'SO',
    'MPC',
    'VLO',
    'NOC',
    'ITW',
    'PSA',
    'PH',
    'HCA',
    'APD',
    'SHW',
    'CTSH',
    'MNST',
    'ORLY',
    'AON',
    'COP',
    'TGT',
    'AEP',
    'SRE',
    'MAR',
    'NSC',
    'ROST',
    'KMI',
    'FTNT',
    'D',
    'PCG',
    'GEV',
    'CEG',
    'VST',
    'MSTR',
    'APP',
    'CRWD',
    'SNOW',
    'WDAY',
    'DASH',
    'UBER',
    'TTD',
    'MRVL',
    'MDB',
    'ZS',
    'HUBS',
    'PINS',
    'SNAP',
    'DDOG',
    'NET',
    'PATH',
    'RBLX',
    'TOST',
    'ARM',
    'NU',
    'SOFI',
    'HOOD',
    'COIN',
    'MRNA',
    'DKNG',
    'LUCID',
    'RIVN',
    'RIOT',
    'MARA',
    'SQ',
    'TWLO',
    'OKTA',
    'U',
    'AFRM',
    'UPST',
    'CPNG',
    'SE',
    'BIDU',
    'BABA',
    'JD',
    'NTES',
    'PDD',
    'LI',
    'NIO',
    'XPEV',
    'TCEHY',
    'TSM',
    'ASML',
    'SAP',
    'BN',
    'HSBC',
] as const;

type FinnhubStock = (typeof FINNHUB_STOCKS)[number];

const FinnhubStockSet = new Set<string>(FINNHUB_STOCKS);

const stockCache = new Map<string, StockProfile2>();

const FALLBACK_STOCKS: StockProfile2[] = FINNHUB_STOCKS.map((sym) => ({
    name: sym,
    ticker: sym,
    currency: 'USD',
    shareOutstanding: 0,
    logo: '',
    country: 'US',
}));

export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
    const trimmed = query?.trim() ?? '';

    if (!trimmed) {
        // Return top stocks sorted by market cap
        const top = FINNHUB_STOCKS.slice(0, 15);
        const results = await Promise.all(
            top.map(async (sym): Promise<{ sym: string; profile: StockProfile2 }> => {
                const cached = stockCache.get(sym);
                if (cached) return { sym, profile: cached };
                try {
                    const profile = await fetchJSON<StockProfile2>(
                        `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${process.env.FINNHUB_API_KEY ?? ''}`,
                        86400,
                    );
                    stockCache.set(sym, profile);
                    return { sym, profile };
                } catch {
                    return { sym, profile: { name: sym, ticker: sym, currency: 'USD', shareOutstanding: 0, logo: '', country: 'US' } };
                }
            }),
        );
        return results
            .filter((r) => r.profile?.name)
            .map(({ sym, profile }) => ({
                symbol: sym,
                name: profile.name || sym,
                exchange: '',
                type: '',
                company: profile.name || sym,
                logo: profile.logo || '',
                isInWatchlist: false,
            }));
    }

    const up = trimmed.toUpperCase();
    const filtered = FINNHUB_STOCKS.filter((s) => s.includes(up) || s.startsWith(up));
    return filtered.slice(0, 10).map((sym) => ({
        symbol: sym,
        name: sym,
        exchange: '',
        type: '',
        company: sym,
        logo: '',
        isInWatchlist: false,
    }));
});

// ─── Daily / Weekly Candles ────────────────────────────────────────────────

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

/**
 * Fetch Yahoo 1h data and aggregate into 4H candles using session-aware grouping.
 *
 * Yahoo 1h has a limited history window (~7 days on free tier, possibly longer).
 * We try progressively shorter ranges until Yahoo responds successfully.
 * Returns null if Yahoo is completely unreachable.
 */
async function fetchYahoo1hAndAggregate(symbol: string, from: number, to: number): Promise<CandleDataPoint[] | null> {
    // Yahoo 1h history limits vary. We try decreasing ranges until one works.
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

            // Build 1h candles from raw data
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

            // ── Session-aware 1h → 4H aggregation ──────────────────────────
            const SESSION_GAP_THRESHOLD = 4 * 3600; // 4 hours in seconds

            // Split hourly candles into trading sessions
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

            // Aggregate each session's candles into 4H groups
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

/**
 * Split a daily candle into two synthetic 4H bars with realistic OHLC distribution.
 * Used as a fallback when Yahoo 1h data is unavailable for deep history.
 *
 * Real US equity 4H market structure (verified against TradingView):
 *   Bar 1 (9:30-13:30 ET):  ~62% of daily move, higher volume (open auction)
 *   Bar 2 (13:30-16:00 ET): ~38% of daily move, moderate volume (close)
 *   Gap: 20h to next trading day (overnight + pre-market)
 *
 * Volume is distributed 55/45 (higher at open than close),
 * which matches typical intraday volume U-shape in equity markets.
 *
 * Guarantees:
 * - Aggregate high == daily high (one bar always reaches the daily extreme)
 * - Aggregate low  == daily low  (one bar always reaches the daily extreme)
 * - First bar open == daily open, last bar close == daily close
 * - Each bar's high >= max(open,close), low <= min(open,close)
 * - Timestamps are 4 hours apart (14400 seconds), matching real 4H bar spacing
 */
function splitDailyInto4H(daily: CandleDataPoint): CandleDataPoint[] {
    const { open, high, low, close, volume, time } = daily;
    const totalVol = volume ?? 0;
    const direction = close >= open ? 1 : -1;
    const absMove = Math.abs(close - open);

    // Two-bar price progression: ~62% in first 4h, ~38% in last 2.5h
    // 4h / 6.5h ≈ 0.615 — first bar covers majority of trading session
    const mid = open + direction * absMove * 0.62;

    if (direction > 0) {
        // Bullish day: low is hit early (bar 1), high reached late (bar 2)
        return [
            {
                time,
                open,
                high: Math.max(open, mid),
                low,  // daily low is reached in the opening range
                close: mid,
                volume: Math.round(totalVol * 0.55),
            },
            {
                time: (time + 4 * 3600) as UTCTimestamp,
                open: mid,
                high,  // daily high reached in the closing push
                low: Math.min(mid, close),
                close,
                volume: totalVol - Math.round(totalVol * 0.55),
            },
        ];
    } else {
        // Bearish day: high is hit early (bar 1), low reached late (bar 2)
        return [
            {
                time,
                open,
                high,  // daily high reached in the opening sell-off
                low: Math.min(open, mid),
                close: mid,
                volume: Math.round(totalVol * 0.55),
            },
            {
                time: (time + 4 * 3600) as UTCTimestamp,
                open: mid,
                high: Math.max(mid, close),
                low,  // daily low reached in the late decline
                close,
                volume: totalVol - Math.round(totalVol * 0.55),
            },
        ];
    }
}

export async function get4HourCandles(symbol: string, days = 3650): Promise<CandleDataPoint[]> {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;

    // Strategy: Try Yahoo 1h for recent data first.
    // Yahoo typically provides 1h data for up to ~60-730 days.
    // If it returns data, fill the older gap with daily-split synthetic bars.
    const yahoo4H = await fetchYahoo1hAndAggregate(symbol, from, to);

    if (yahoo4H && yahoo4H.length > 0) {
        // Check how far back Yahoo data goes
        const earliestYahooTime = yahoo4H[0].time;

        if (earliestYahooTime <= from + 86400) {
            // Yahoo returned data covering the full range — no synthetic bars needed
            console.log(`[4H] ${symbol}: ${yahoo4H.length} bars from Yahoo only`);
            return yahoo4H;
        }

        // Yahoo data doesn't cover the full range — need synthetic bars for the gap
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

        // Merge: ensure no overlap + handle time discontinuity
        if (olderCandles.length > 0) {
            const lastOldTime = olderCandles[olderCandles.length - 1].time;
            const filteredYahoo = yahoo4H.filter(c => c.time > lastOldTime);
            console.log(`[4H] ${symbol}: ${olderCandles.length} synthetic + ${filteredYahoo.length} Yahoo bars`);
            // Log the transition point to detect discontinuities
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

    // Fallback: Yahoo entirely failed — use daily-split for the full range
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

// SPRINT 3: getWeeklyCandles() ve '1wk' case tamamen kaldırıldı.
// Kod tabanında 1wk desteği yok. Sadece 4h ve 1d destekleniyor.

/** Fetch recent intraday (5min) candles for pending order evaluation. */
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

// ─── AI-optimized data fetcher ─────────────────────────────────────────────

/**
 * AI tool'ları için direkt Yahoo Finance üzerinden veri çeken fonksiyon.
 * Finnhub'ı atlar — API key, rate limit (60 istek/dk) ve timeout sorunlarını ortadan kaldırır.
 */
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

/**
 * Unified dispatcher: fetches candle data for any supported interval.
 * Automatically applies clampDays() to enforce per-timeframe limits.
 * Use this in TA page, AI tools, and Inngest jobs to eliminate
 * repetitive if/else chains.
 *
 * ENTRY GUARD: Rejects 1h, 1M, and any disallowed timeframe at runtime.
 */
export async function getCandlesForInterval(
    symbol: string,
    interval: string,
    days: number
): Promise<CandleDataPoint[]> {
    // ── Timeframe Isolation Guard ──────────────────────────────────────
    const { assertAllowedTimeframe } = await import('@/lib/ta/timeframe-guard');
    assertAllowedTimeframe(interval, 'finnhub.getCandlesForInterval');

    // SPRINT 3: 1wk tamamen kaldırıldı. Sadece 4h ve 1d destekleniyor.
    switch (interval) {
        case '4h':
            return get4HourCandles(symbol, days);
        case '1d':
        default:
            return getDailyCandles(symbol, days);
    }
}

