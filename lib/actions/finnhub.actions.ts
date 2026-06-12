'use server';

import { fetchJSON as _fetchJSON } from './finnhub/base';
import { getNews as _getNews } from './finnhub/news';
import { searchStocks as _searchStocks } from './finnhub/search';
import {
    getDailyCandles as _getDailyCandles,
    get4HourCandles as _get4HourCandles,
    getYahooIntradayCandles as _getYahooIntradayCandles,
    getDailyCandlesForAI as _getDailyCandlesForAI,
    getCandlesForInterval as _getCandlesForInterval,
} from './finnhub/candles';

export async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
    return _fetchJSON<T>(url, revalidateSeconds);
}

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
    return _getNews(symbols);
}

export async function searchStocks(query?: string): Promise<StockWithWatchlistStatus[]> {
    return _searchStocks(query);
}

export async function getQuote(symbol: string): Promise<QuoteData | null> {
    const token = process.env.FINNHUB_API_KEY || '';
    if (!token) return null;
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
    try {
        return await fetchJSON<QuoteData>(url, 60);
    } catch {
        return null;
    }
}

export async function getDailyCandles(symbol: string, days?: number, toTimestamp?: number): Promise<CandleDataPoint[]> {
    return _getDailyCandles(symbol, days, toTimestamp);
}

export async function get4HourCandles(symbol: string, days?: number, toTimestamp?: number): Promise<CandleDataPoint[]> {
    return _get4HourCandles(symbol, days, toTimestamp);
}

export async function getYahooIntradayCandles(symbol: string, days?: number): Promise<CandleDataPoint[]> {
    return _getYahooIntradayCandles(symbol, days);
}

export async function getDailyCandlesForAI(symbol: string, days?: number): Promise<CandleDataPoint[]> {
    return _getDailyCandlesForAI(symbol, days);
}

export async function getCandlesForInterval(symbol: string, interval: string, days: number, toTimestamp?: number): Promise<CandleDataPoint[]> {
    return _getCandlesForInterval(symbol, interval, days, toTimestamp);
}
