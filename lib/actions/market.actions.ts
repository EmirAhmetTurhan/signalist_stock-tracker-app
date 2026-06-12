import { unstable_cache } from "next/cache";
import yahooFinance from "yahoo-finance2";

// Safely suppress notices if the function exists
if (typeof (yahooFinance as any).suppressNotices === 'function') {
    (yahooFinance as any).suppressNotices(['yahooSurvey']);
}

/**
 * Internal worker function to fetch SPY data and compute the 200-SMA regime.
 * Cached via Next.js unstable_cache for 24 hours to prevent repeated API calls.
 * Returns a Record mapping 'YYYY-MM-DD' -> boolean (true = Bullish, false = Bearish).
 */
const getBroadMarketRegimeCached = unstable_cache(
    async (fromUnix: number, toUnix: number): Promise<Record<string, boolean>> => {
        try {
            const symbol = "SPY";
            
            // We need 200 trading days of lookback to calculate the 200-SMA accurately.
            // 300 calendar days is a safe margin to cover weekends and holidays.
            const lookbackDays = 300; 
            const fromDate = new Date((fromUnix - lookbackDays * 86400) * 1000);
            const toDate = new Date(toUnix * 1000);

            // Fetch daily historical data
            const result: any[] = await yahooFinance.historical(symbol, {
                period1: fromDate,
                period2: toDate,
                interval: "1d",
            });

            if (!result || result.length === 0) {
                return {};
            }

            const closes = result.map(c => c.close);
            const dates = result.map(c => c.date.toISOString().split('T')[0]);
            
            const regimeRecord: Record<string, boolean> = {};
            const period = 200;

            if (result.length < period) {
                console.warn(`[getBroadMarketRegime] Not enough data points (${result.length}) to calculate 200-SMA.`);
                return {};
            }

            // Calculate 200-SMA
            for (let i = period - 1; i < result.length; i++) {
                let sum = 0;
                for (let j = i - period + 1; j <= i; j++) {
                    sum += closes[j];
                }
                const sma200 = sum / period;
                const isBullish = closes[i] > sma200;

                // ── LOOK-AHEAD BIAS PROTECTION ──
                // If today is index 'i', today's close vs SMA determines TOMORROW's regime.
                if (i + 1 < result.length) {
                    const nextDateStr = dates[i + 1];
                    regimeRecord[nextDateStr] = isBullish;
                } else {
                    // For the very last day in the dataset, project to the next calendar day
                    const lastDate = result[i].date;
                    const nextDay = new Date(lastDate);
                    nextDay.setDate(lastDate.getDate() + 1);
                    regimeRecord[nextDay.toISOString().split('T')[0]] = isBullish;
                }
            }

            return regimeRecord;
        } catch (error) {
            console.error("[getBroadMarketRegime] Failed to fetch or compute SPY regime:", error);
            return {};
        }
    },
    ['broad-market-regime-spy-data'],
    { revalidate: 86400 } // Cache for 24 hours
);

/**
 * Gets the Broad Market Regime (SPY 200-SMA) map.
 * Evaluates whether the market is Bullish or Bearish for a given date range.
 * 
 * @param from Unix timestamp (seconds)
 * @param to Unix timestamp (seconds)
 * @returns Map of 'YYYY-MM-DD' -> boolean (true = Bullish, false = Bearish)
 */
export async function getBroadMarketRegime(from: number, to: number): Promise<Map<string, boolean>> {
    const record = await getBroadMarketRegimeCached(from, to);
    return new Map(Object.entries(record));
}
