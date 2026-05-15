/**
 * Smart Support & Resistance Detection Engine
 *
 * Algorithm:
 *  1. Find swing highs and swing lows using a look-left/look-right window.
 *  2. Cluster nearby pivots (within 1.2%) so thin price zones don't produce
 *     10 separate lines at basically the same level.
 *  3. Score each cluster by: number of touches + recency weight.
 *  4. Classify as support (below current price) or resistance (above).
 *  5. Calculate Long & Short R:R setups from nearest S/R pair.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SRLevel {
    price: number;
    type: 'support' | 'resistance';
    /** 0–1  (touches × recency weighting) */
    strength: number;
    /** How many swing pivots were merged into this cluster */
    touches: number;
    /** Unix seconds of the most recent touch */
    lastTouchTime: number;
    /** Distance from the current price as a percentage */
    distancePct: number;
}

export interface TradeSetup {
    entry: number;
    sl: number;
    tp: number;
    /** (|TP – Entry|) / (|SL – Entry|) */
    rrRatio: number;
    tpPct: number;
    slPct: number;
}

export interface SRResult {
    levels: SRLevel[];
    currentPrice: number;
    nearestSupport: SRLevel | null;
    nearestResistance: SRLevel | null;
    longSetup: TradeSetup | null;
    shortSetup: TradeSetup | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface Pivot {
    price: number;
    time: number;
}

function findSwingPivots(
    candles: CandleDataPoint[],
    swingWindow: number,
): { highs: Pivot[]; lows: Pivot[] } {
    const highs: Pivot[] = [];
    const lows: Pivot[] = [];

    for (let i = swingWindow; i < candles.length - swingWindow; i++) {
        const c = candles[i];
        let isHigh = true;
        let isLow = true;

        for (let j = i - swingWindow; j <= i + swingWindow; j++) {
            if (j === i) continue;
            if (candles[j].high >= c.high) isHigh = false;
            if (candles[j].low <= c.low) isLow = false;
        }

        if (isHigh) highs.push({ price: c.high, time: Number(c.time) });
        if (isLow) lows.push({ price: c.low, time: Number(c.time) });
    }

    return { highs, lows };
}

/** Greedy single-pass clustering: merge points within `threshold` of cluster mean */
function clusterPivots(
    pivots: Pivot[],
    threshold: number,
): Array<{ avgPrice: number; touches: number; lastTime: number }> {
    if (pivots.length === 0) return [];

    const sorted = [...pivots].sort((a, b) => a.price - b.price);
    const clusters: Array<{ prices: number[]; times: number[] }> = [];

    for (const p of sorted) {
        let merged = false;
        for (const cl of clusters) {
            const avg = cl.prices.reduce((s, x) => s + x, 0) / cl.prices.length;
            if (Math.abs(p.price - avg) / avg < threshold) {
                cl.prices.push(p.price);
                cl.times.push(p.time);
                merged = true;
                break;
            }
        }
        if (!merged) clusters.push({ prices: [p.price], times: [p.time] });
    }

    return clusters.map(cl => ({
        avgPrice: cl.prices.reduce((s, x) => s + x, 0) / cl.prices.length,
        touches: cl.prices.length,
        lastTime: Math.max(...cl.times),
    }));
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * @param candles       Full OHLCV history, oldest-first
 * @param swingWindow   Look-left / look-right bars for pivot detection (default 5)
 * @param maxLevels     Max S/R lines to return (default 10)
 * @param lookbackBars  How many recent bars to analyse (default 300)
 */
export function detectSupportResistance(
    candles: CandleDataPoint[],
    swingWindow = 5,
    maxLevels = 10,
    lookbackBars = 300,
): SRResult | null {
    if (candles.length < swingWindow * 2 + 10) return null;

    // Limit to recent history so levels stay relevant
    const recentCandles = candles.slice(-lookbackBars);
    const { highs, lows } = findSwingPivots(recentCandles, swingWindow);

    const highClusters = clusterPivots(highs, 0.012);
    const lowClusters = clusterPivots(lows, 0.012);

    const currentPrice = candles[candles.length - 1].close;
    const earliestTime = Number(recentCandles[0].time);
    const latestTime = Number(recentCandles[recentCandles.length - 1].time);
    const timeRange = Math.max(latestTime - earliestTime, 1);

    const maxTouches = Math.max(
        ...highClusters.map(c => c.touches),
        ...lowClusters.map(c => c.touches),
        1,
    );

    const buildLevel = (
        cl: { avgPrice: number; touches: number; lastTime: number },
    ): SRLevel => {
        const recency = (cl.lastTime - earliestTime) / timeRange;
        const touchScore = cl.touches / maxTouches;
        const strength = Math.min(1, touchScore * 0.6 + recency * 0.4);
        const type: SRLevel['type'] = cl.avgPrice >= currentPrice ? 'resistance' : 'support';
        const distancePct = ((cl.avgPrice - currentPrice) / currentPrice) * 100;

        return {
            price: cl.avgPrice,
            type,
            strength,
            touches: cl.touches,
            lastTouchTime: cl.lastTime,
            distancePct,
        };
    };

    const allLevels: SRLevel[] = [
        ...highClusters.map(buildLevel),
        ...lowClusters.map(buildLevel),
    ];

    // De-duplicate levels that ended up on the same side and very close
    const deduped = allLevels.filter((a, i) =>
        !allLevels.some((b, j) =>
            j < i && Math.abs(a.price - b.price) / b.price < 0.005,
        ),
    );

    // Keep top N by strength, then sort by price descending for display
    const topLevels = deduped
        .sort((a, b) => b.strength - a.strength)
        .slice(0, maxLevels)
        .sort((a, b) => b.price - a.price);

    // Nearest support = highest price below current
    const nearestSupport = topLevels
        .filter(l => l.type === 'support')
        .sort((a, b) => b.price - a.price)[0] ?? null;

    // Nearest resistance = lowest price above current
    const nearestResistance = topLevels
        .filter(l => l.type === 'resistance')
        .sort((a, b) => a.price - b.price)[0] ?? null;

    // ─── R:R Setups ──────────────────────────────────────────────────────────

    let longSetup: TradeSetup | null = null;
    let shortSetup: TradeSetup | null = null;

    if (nearestSupport && nearestResistance) {
        const longProfit = nearestResistance.price - currentPrice;
        const longRisk = currentPrice - nearestSupport.price;

        if (longRisk > 0 && longProfit > 0) {
            longSetup = {
                entry: currentPrice,
                sl: nearestSupport.price,
                tp: nearestResistance.price,
                rrRatio: longProfit / longRisk,
                tpPct: (longProfit / currentPrice) * 100,
                slPct: (longRisk / currentPrice) * 100,
            };
        }

        const shortProfit = currentPrice - nearestSupport.price;
        const shortRisk = nearestResistance.price - currentPrice;

        if (shortRisk > 0 && shortProfit > 0) {
            shortSetup = {
                entry: currentPrice,
                sl: nearestResistance.price,
                tp: nearestSupport.price,
                rrRatio: shortProfit / shortRisk,
                tpPct: (shortProfit / currentPrice) * 100,
                slPct: (shortRisk / currentPrice) * 100,
            };
        }
    }

    return {
        levels: topLevels,
        currentPrice,
        nearestSupport,
        nearestResistance,
        longSetup,
        shortSetup,
    };
}
