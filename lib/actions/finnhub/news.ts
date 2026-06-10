import 'server-only';

import { fetchJSON, FINNHUB_BASE_URL } from './base';

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
