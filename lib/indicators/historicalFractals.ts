/**
 * Historical Fractal Matching Engine
 * Finds past periods in a stock's own history where the price shape closely
 * resembled the current pattern, then projects what happened next.
 *
 * Algorithm:
 *  1. Normalise the last `lookback` closes to % change from the window start.
 *  2. Slide the same-length window across all historical candles (excluding
 *     the last `lookback + horizon` bars to avoid self-reference).
 *  3. Rank windows by Pearson correlation with the current pattern.
 *  4. De-duplicate overlapping windows, keep top `topN`.
 *  5. For each match record the next `horizon` candles outcome.
 *  6. Average outcome paths → ghost projection line.
 */

export interface FractalMatch {
    /** Unix-second timestamp of the first candle in the historical window */
    startTime: number;
    /** Unix-second timestamp of the last candle in the historical window */
    endTime: number;
    /** Pearson correlation mapped to 0–1 (1 = perfect shape match) */
    similarity: number;
    /** % price change over the next `horizon` candles after the match */
    outcomePercent: number;
    outcomeDirection: 'up' | 'down' | 'flat';
    /** Per-candle normalised outcome path (length = horizon) */
    outcomePath: number[];
}

export interface FractalResult {
    matches: FractalMatch[];
    avgOutcomePercent: number;
    bullishCount: number;
    bearishCount: number;
    flatCount: number;
    /** Weighted-average similarity across all matches (0–1) */
    avgSimilarity: number;
    /** Ghost projection line: current last price + projected future prices */
    projectedLine: { time: number; value: number }[];
    lookback: number;
    horizon: number;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

/** Normalise a price series to % deviation from its first element */
function normalise(prices: number[]): number[] {
    const base = prices[0];
    if (!base) return prices.map(() => 0);
    return prices.map(p => (p - base) / base * 100);
}

/** Pearson correlation coefficient between two same-length arrays */
function pearson(a: number[], b: number[]): number {
    const n = a.length;
    if (n < 2) return 0;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da2 = 0, db2 = 0;
    for (let i = 0; i < n; i++) {
        const da = a[i] - ma;
        const db = b[i] - mb;
        num += da * db;
        da2 += da * da;
        db2 += db * db;
    }
    if (da2 === 0 || db2 === 0) return 0;
    return num / Math.sqrt(da2 * db2);
}

/** Map Pearson correlation [-1, 1] → similarity [0, 1] */
const corrToSim = (r: number) => (r + 1) / 2;

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param candles      Full OHLCV history, oldest-first
 * @param lookback     How many candles define the "shape" pattern (default 30)
 * @param horizon      How many candles forward to measure outcome (default 15)
 * @param topN         How many top matches to keep (default 5)
 * @param intervalSecs Seconds per candle (86400 = daily, 14400 = 4h)
 */
export function detectHistoricalFractals(
    candles: CandleDataPoint[],
    lookback = 30,
    horizon = 15,
    topN = 5,
    intervalSecs = 86400,
): FractalResult | null {
    // Need enough historical data
    if (candles.length < lookback * 2 + horizon + 10) return null;

    const closes = candles.map(c => c.close);
    const times = candles.map(c => Number(c.time));

    // Current pattern: last `lookback` closes, normalised
    const currentNorm = normalise(closes.slice(-lookback));

    // Scan range: windows must have `horizon` candles after them AND
    // must not overlap with the current pattern (last `lookback` bars)
    const scanEnd = candles.length - horizon - lookback - 1; // exclusive upper bound for window start
    const scanStart = lookback;                                  // need lookback bars before window end

    if (scanEnd <= scanStart) return null;

    // Score every valid window
    const scored: Array<{ startIdx: number; corr: number }> = [];

    for (let s = scanStart; s <= scanEnd; s++) {
        const windowNorm = normalise(closes.slice(s, s + lookback));
        const corr = pearson(currentNorm, windowNorm);
        scored.push({ startIdx: s, corr });
    }

    // Sort descending by correlation
    scored.sort((a, b) => b.corr - a.corr);

    // De-duplicate: skip windows that overlap with an already-selected one
    const selected: typeof scored = [];
    for (const c of scored) {
        const overlaps = selected.some(s => Math.abs(s.startIdx - c.startIdx) < lookback);
        if (!overlaps) {
            selected.push(c);
            if (selected.length >= topN) break;
        }
    }

    if (selected.length === 0) return null;

    // Build matches and collect outcome paths
    const matches: FractalMatch[] = [];
    const outcomePaths: number[][] = [];

    for (const { startIdx, corr } of selected) {
        const endIdx = startIdx + lookback - 1;
        const basePrice = closes[endIdx];

        // Horizon outcome
        const futureSlice = closes.slice(endIdx + 1, endIdx + 1 + horizon);
        if (futureSlice.length < horizon) continue;

        const outcomePath = futureSlice.map(p => (p - basePrice) / basePrice * 100);
        const outcomePercent = outcomePath[outcomePath.length - 1];

        outcomePaths.push(outcomePath);
        matches.push({
            startTime: times[startIdx],
            endTime: times[endIdx],
            similarity: corrToSim(corr),
            outcomePercent,
            outcomeDirection: outcomePercent > 1 ? 'up' : outcomePercent < -1 ? 'down' : 'flat',
            outcomePath,
        });
    }

    if (matches.length === 0) return null;

    // Aggregate statistics
    const avgOutcomePercent = matches.reduce((s, m) => s + m.outcomePercent, 0) / matches.length;
    const avgSimilarity = matches.reduce((s, m) => s + m.similarity, 0) / matches.length;
    const bullishCount = matches.filter(m => m.outcomeDirection === 'up').length;
    const bearishCount = matches.filter(m => m.outcomeDirection === 'down').length;
    const flatCount = matches.filter(m => m.outcomeDirection === 'flat').length;

    // Build weighted-average outcome path for ghost line
    // Weight by similarity so higher-confidence matches contribute more
    const totalSim = matches.reduce((s, m) => s + m.similarity, 0);
    const pathLen = Math.min(...outcomePaths.map(p => p.length));
    const avgPath: number[] = [];

    for (let i = 0; i < pathLen; i++) {
        let weighted = 0;
        for (let j = 0; j < matches.length; j++) {
            weighted += matches[j].outcomePath[i] * matches[j].similarity;
        }
        avgPath.push(weighted / totalSim);
    }

    // Ghost projection line (absolute prices)
    const lastPrice = closes[closes.length - 1];
    const lastTime = times[times.length - 1];

    const projectedLine: { time: number; value: number }[] = [
        { time: lastTime, value: lastPrice }, // anchor point
    ];
    for (let i = 0; i < avgPath.length; i++) {
        projectedLine.push({
            time: lastTime + (i + 1) * intervalSecs,
            value: lastPrice * (1 + avgPath[i] / 100),
        });
    }

    return {
        matches,
        avgOutcomePercent,
        bullishCount,
        bearishCount,
        flatCount,
        avgSimilarity,
        projectedLine,
        lookback,
        horizon,
    };
}
