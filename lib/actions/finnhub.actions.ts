'use server';

import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';
import { cache } from 'react';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const NEXT_PUBLIC_FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
    const options: RequestInit & { next?: { revalidate?: number } } = revalidateSeconds
        ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
        : { cache: 'no-store' };

    const res = await fetch(url, options);
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Fetch failed ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
}

export { fetchJSON };

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
    try {
        const range = getDateRange(5);
        const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) {
            throw new Error('FINNHUB API key is not configured');
        }
        const cleanSymbols = (symbols || [])
            .map((s) => s?.trim().toUpperCase())
            .filter((s): s is string => Boolean(s));

        const maxArticles = 6;

        // If we have symbols, try to fetch company news per symbol and round-robin select
        if (cleanSymbols.length > 0) {
            const perSymbolArticles: Record<string, RawNewsArticle[]> = {};

            await Promise.all(
                cleanSymbols.map(async (sym) => {
                    try {
                        const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}&token=${token}`;
                        const articles = await fetchJSON<RawNewsArticle[]>(url, 300);
                        perSymbolArticles[sym] = (articles || []).filter(validateArticle);
                    } catch (e) {
                        console.error('Error fetching company news for', sym, e);
                        perSymbolArticles[sym] = [];
                    }
                })
            );

            const collected: MarketNewsArticle[] = [];
            // Round-robin up to 6 picks
            for (let round = 0; round < maxArticles; round++) {
                for (let i = 0; i < cleanSymbols.length; i++) {
                    const sym = cleanSymbols[i];
                    const list = perSymbolArticles[sym] || [];
                    if (list.length === 0) continue;
                    const article = list.shift();
                    if (!article || !validateArticle(article)) continue;
                    collected.push(formatArticle(article, true, sym, round));
                    if (collected.length >= maxArticles) break;
                }
                if (collected.length >= maxArticles) break;
            }

            if (collected.length > 0) {
                // Sort by datetime desc
                collected.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
                return collected.slice(0, maxArticles);
            }
            // If none collected, fall through to general news
        }

        // General market news fallback or when no symbols provided
        const generalUrl = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
        const general = await fetchJSON<RawNewsArticle[]>(generalUrl, 300);

        const seen = new Set<string>();
        const unique: RawNewsArticle[] = [];
        for (const art of general || []) {
            if (!validateArticle(art)) continue;
            const key = `${art.id}-${art.url}-${art.headline}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(art);
            if (unique.length >= 20) break; // cap early before final slicing
        }

        const formatted = unique.slice(0, maxArticles).map((a, idx) => formatArticle(a, false, undefined, idx));
        return formatted;
    } catch (err) {
        console.error('getNews error:', err);
        throw new Error('Failed to fetch news');
    }
}

export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
    try {
        const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
        if (!token) {
            // If no token, log and return empty to avoid throwing per requirements
            console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
            return [];
        }

        const trimmed = typeof query === 'string' ? query.trim() : '';

        let results: FinnhubSearchResult[] = [];

        // Optional exchange lookup populated when fetching popular profiles
        let exchangeBySymbol: Map<string, string | undefined> | undefined;

        if (!trimmed) {
            // Fetch top 10 popular symbols' profiles
            const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
            type StockProfile2 = {
                name?: string;
                ticker?: string;
                exchange?: string;
            } | null;

            const profiles = await Promise.all(
                top.map(async (sym): Promise<{ sym: string; profile: StockProfile2 }> => {
                    try {
                        const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
                        // Revalidate every hour
                        const profile = await fetchJSON<NonNullable<StockProfile2>>(url, 3600);
                        return { sym, profile };
                    } catch (e) {
                        console.error('Error fetching profile2 for', sym, e);
                        return { sym, profile: null };
                    }
                })
            );

            // Prepare an exchange lookup from profiles
            exchangeBySymbol = new Map<string, string | undefined>(
                profiles.map(({ sym, profile }) => [sym.toUpperCase(), profile?.exchange])
            );

            results = profiles
                .map(({ sym, profile }) => {
                    const symbol = sym.toUpperCase();
                    const name: string | undefined = profile?.name || profile?.ticker || undefined;
                    if (!name) return undefined;
                    const r: FinnhubSearchResult = {
                        symbol,
                        description: name,
                        displaySymbol: symbol,
                        type: 'Common Stock',
                    };
                    // Exchange will be looked up later from exchangeBySymbol map
                    return r;
                })
                .filter((x): x is FinnhubSearchResult => Boolean(x));
        } else {
            const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&token=${token}`;
            const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
            results = Array.isArray(data?.result) ? data.result : [];
        }

        const mapped: StockWithWatchlistStatus[] = results
            .map((r) => {
                const upper = (r.symbol || '').toUpperCase();
                const name = r.description || upper;
                const exchangeFromDisplay = (r.displaySymbol as string | undefined) || undefined;
                // If popular symbols branch was used, we can pull exchange from the prepared map; otherwise undefined
                const exchangeFromProfile = (typeof upper === 'string' && typeof exchangeBySymbol !== 'undefined'
                    ? exchangeBySymbol.get(upper)
                    : undefined) as string | undefined;
                const exchange = exchangeFromDisplay || exchangeFromProfile || 'US';
                const type = r.type || 'Stock';
                const item: StockWithWatchlistStatus = {
                    symbol: upper,
                    name,
                    exchange,
                    type,
                    isInWatchlist: false,
                };
                return item;
            })
            .slice(0, 15);

        return mapped;
    } catch (err) {
        console.error('Error in stock search:', err);
        return [];
    }
});

// ---- Candles (OHLC) ----
// Lightweight Charts needs an array of OHLC with unix seconds timestamps
export async function getDailyCandles(symbol: string, days = 180): Promise<CandleDataPoint[]> {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;

    // 1) Try Finnhub first (if token exists)
    try {
        const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
        if (token) {
            const url = `${FINNHUB_BASE_URL}/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}&token=${token}`;
            type CandleResponse = { s: 'ok' | string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] };
            const data = await fetchJSON<CandleResponse>(url, 600);
            if (data && data.s === 'ok' && Array.isArray(data.t) && data.t.length > 0) {
                const out: CandleDataPoint[] = [];
                for (let i = 0; i < data.t.length; i++) {
                    const o = Number(data.o?.[i]);
                    const h = Number(data.h?.[i]);
                    const l = Number(data.l?.[i]);
                    const c = Number(data.c?.[i]);
                    const v = Number(data.v?.[i]);
                    if ([o, h, l, c].every((v) => Number.isFinite(v))) {
                        const item: CandleDataPoint = { time: data.t[i] as UTCTimestamp, open: o, high: h, low: l, close: c };
                        if (Number.isFinite(v)) item.volume = v as number;
                        out.push(item);
                    }
                }
                if (out.length > 0) return out;
            }
        }
    } catch (e) {
        console.error('getDailyCandles Finnhub error', e);
        // fall through to Yahoo
    }

    // 2) Fallback to Yahoo Finance (no API key needed)
    try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${from}&period2=${to}`;
        const res = await fetch(yahooUrl, { cache: 'force-cache', next: { revalidate: 600 } });
        if (!res.ok) throw new Error(`Yahoo chart fetch failed: ${res.status}`);
        const json: any = await res.json();
        const result = json?.chart?.result?.[0];
        const ts: number[] | undefined = result?.timestamp;
        const quote = result?.indicators?.quote?.[0] || {};
        const opens: number[] | undefined = quote.open;
        const highs: number[] | undefined = quote.high;
        const lows: number[] | undefined = quote.low;
        const closes: number[] | undefined = quote.close;
        const volumes: number[] | undefined = quote.volume;
        if (Array.isArray(ts) && ts.length) {
            const out: CandleDataPoint[] = [];
            for (let i = 0; i < ts.length; i++) {
                const o = Number(opens?.[i]);
                const h = Number(highs?.[i]);
                const l = Number(lows?.[i]);
                const c = Number(closes?.[i]);
                const v = Number(volumes?.[i]);
                if ([o, h, l, c].every((v) => Number.isFinite(v))) {
                    const item: CandleDataPoint = { time: ts[i] as UTCTimestamp, open: o, high: h, low: l, close: c };
                    if (Number.isFinite(v)) item.volume = v as number;
                    out.push(item);
                }
            }
            if (out.length > 0) return out;
        }
    } catch (e) {
        console.error('getDailyCandles Yahoo fallback error', e);
    }

    return [];
}

