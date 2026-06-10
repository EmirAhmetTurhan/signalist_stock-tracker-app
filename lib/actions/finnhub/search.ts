import 'server-only';

import { cache } from 'react';
import { fetchJSON, FINNHUB_BASE_URL } from './base';

export type StockProfile2 = {
    name: string;
    ticker: string;
    currency: string;
    shareOutstanding: number;
    logo: string;
    country: string;
};

export const FINNHUB_STOCKS = [
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

export type FinnhubStock = (typeof FINNHUB_STOCKS)[number];

export const FinnhubStockSet = new Set<string>(FINNHUB_STOCKS);

export const stockCache = new Map<string, StockProfile2>();

export const FALLBACK_STOCKS: StockProfile2[] = FINNHUB_STOCKS.map((sym) => ({
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
