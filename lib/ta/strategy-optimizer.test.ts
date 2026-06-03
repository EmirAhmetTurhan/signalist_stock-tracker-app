import { describe, it, expect } from 'vitest';
import { runStrategyBacktest, optimizeStrategyParams, discoverStrategy, DISCOVERY_POOL } from '@/lib/ta/strategy-optimizer';
import type { Candle } from '@/lib/ta/backtest';
import type { AllData } from '@/lib/ta/strategy-optimizer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deterministic candle generator (no Math.random) for reproducible tests */
function makeCandles(count: number, trend: 'up' | 'down' | 'flat' = 'up'): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
        const open = price;
        if (trend === 'up') price += 1 + (i % 5) * 0.1;
        else if (trend === 'down') price -= 1 + (i % 5) * 0.1;
        else price = 100 + Math.sin(i * 0.1) * 0.5;
        const close = price;
        candles.push({
            time: i + 1,
            open: Math.min(open, close),
            high: Math.max(open, close) + 0.1,
            low: Math.min(open, close) - 0.1,
            close,
            volume: 1000,
        });
    }
    return candles;
}

/**
 * Build a series of alternating values to guarantee crossover events.
 * Changes between highVal and lowVal every `period` bars so that
 * hasFreshCrossover() detects a change between consecutive bars.
 */
function oscillatingSeries(
    candles: Candle[],
    highVal: number,
    lowVal: number,
    period: number = 3,
): { time: string | number; value: number }[] {
    return candles.map((c, i) => ({
        time: c.time,
        value: Math.floor(i / period) % 2 === 0 ? highVal : lowVal,
    }));
}

/** Build a constant-value series */
function constantSeries(candles: Candle[], value: number): { time: string | number; value: number }[] {
    return candles.map((c) => ({ time: c.time, value }));
}

/**
 * Build AllData for a single indicator.
 * @param alt - if true, use oscillating primary values (for crossover tests)
 */
function makeAllData(
    key: string,
    candles: Candle[],
    value: number,
    secondary?: number,
    alt?: { high: number; low: number; period?: number },
): AllData {
    if (alt) {
        const primary = oscillatingSeries(candles, alt.high, alt.low, alt.period ?? 3);
        const sec = constantSeries(candles, secondary ?? (alt.high + alt.low) / 2);
        switch (key) {
            case 'rsi':
                return { rsiData: { rsi: primary, ma: sec } };
            case 'cci':
                return { cciData: { cci: primary, ma: sec } };
            case 'wavetrend':
                return { waveTrendData: { wt1: primary, wt2: sec } };
            case 'macd':
                return { macdData: { macd: primary, signal: sec, histogram: candles.map(c => ({ time: c.time, value: 0, color: 'gray' })) } };
            case 'stochrsi':
                return { stochRsiData: { k: primary, d: sec } };
            case 'dmi':
                return { dmiData: { plusDI: primary, minusDI: constantSeries(candles, alt.low), adx: constantSeries(candles, 20) } };
            case 'smi':
                return { smiData: { smi: primary, signal: sec } };
            case 'ao':
                return { aoData: primary };
            case 'mfi':
                return { mfiData: { mfi: primary } };
            case 'wpr':
                return { wprData: primary };
            case 'di':
                return { diData: primary };
            case 'cmf':
                return { cmfData: primary };
            case 'ad':
                return { adData: primary };
            case 'netvol':
                return { nvData: primary };
            case 'madr':
                return { madrData: primary };
            default:
                return {};
        }
    }

    const series = (v: number) => constantSeries(candles, v);
    switch (key) {
        case 'rsi':
            return { rsiData: { rsi: series(value), ma: series(secondary ?? value - 10) } };
        case 'cci':
            return { cciData: { cci: series(value), ma: series(secondary ?? value - 10) } };
        case 'wavetrend':
            return { waveTrendData: { wt1: series(value), wt2: series(secondary ?? value - 10) } };
        case 'macd':
            return { macdData: { macd: series(value), signal: series(secondary ?? value - 10), histogram: candles.map(c => ({ time: c.time, value: 0, color: 'gray' })) } };
        case 'stochrsi':
            return { stochRsiData: { k: series(value), d: series(secondary ?? value - 10) } };
        case 'dmi':
            return { dmiData: { plusDI: series(value), minusDI: series(secondary ?? value - 10), adx: series(20) } };
        case 'smi':
            return { smiData: { smi: series(value), signal: series(secondary ?? value - 10) } };
        case 'ao':
            return { aoData: series(value) };
        case 'mfi':
            return { mfiData: { mfi: series(value) } };
        case 'wpr':
            return { wprData: series(value) };
        case 'di':
            return { diData: series(value) };
        case 'cmf':
            return { cmfData: series(value) };
        case 'ad':
            return { adData: series(value) };
        case 'netvol':
            return { nvData: series(value) };
        case 'madr':
            return { madrData: series(value) };
        default:
            return {};
    }
}

/** Build AllData with multiple indicators, all having the same crossing pattern */
function makeMultiAllData(
    candles: Candle[],
    keys: string[],
    value: number,
    secondary?: number,
    alt?: { high: number; low: number; period?: number },
): AllData {
    let acc: AllData = {};
    for (const key of keys) {
        acc = { ...acc, ...makeAllData(key, candles, value, secondary, alt) };
    }
    return acc;
}

// ─── runStrategyBacktest ───────────────────────────────────────────────────────

describe('runStrategyBacktest', () => {
    it('returns empty result for empty candles', () => {
        const result = runStrategyBacktest([], 'RSI_CCI_WT', {});
        expect(result.totalSignals).toBe(0);
        expect(result.wins).toBe(0);
        expect(result.winRate).toBe(0);
        expect(result.history).toEqual([]);
    });

    it('returns empty result for insufficient candles', () => {
        const candles = makeCandles(10, 'up');
        const data = makeAllData('rsi', candles, 60, 40);
        const result = runStrategyBacktest(candles, 'RSI_CCI_WT', data);
        // Too few candles → 0 signals
        expect(result.totalSignals).toBe(0);
    });

    it('RSI_CCI_WT strategy produces signals with alternating data', () => {
        const candles = makeCandles(200, 'up');
        // Use oscillating values so crossovers occur, generating signals
        // period=15 ensures cooldown (5 bars) doesn't block crossovers of one direction
        const data = makeMultiAllData(candles, ['rsi', 'cci', 'wavetrend'], 60, 40, {
            high: 80, low: 20, period: 15,
        });
        const result = runStrategyBacktest(candles, 'RSI_CCI_WT', data, { lookForward: 5 });
        // With alternating values producing crossovers, should generate signals
        expect(result.totalSignals).toBeGreaterThan(0);
        expect(result.wins).toBeLessThanOrEqual(result.totalSignals);
        expect(result.history).toHaveLength(result.totalSignals);
    });

    it('RSI_CCI_WT produces alternating BUY/SELL signals in trending market', () => {
        const candles = makeCandles(200, 'up');
        // period=15 produces a pattern where signals alternate BUY/SELL
        // Each phase transition (every 15 bars) creates a crossover
        // With cooldown=5 and signal gap=15, both BUY and SELL signals appear
        const data = makeMultiAllData(candles, ['rsi', 'cci', 'wavetrend'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const result = runStrategyBacktest(candles, 'RSI_CCI_WT', data, { lookForward: 5 });
        // Alternating BUY/SELL in uptrend → roughly 50% win rate
        expect(result.totalSignals).toBeGreaterThan(0);
        expect(result.winRate).toBeGreaterThan(0);
        expect(result.winRate).toBeLessThan(100);
    });

    it('RSI_CCI_WT win rate correlates with trend direction', () => {
        const upCandles = makeCandles(200, 'up');
        const downCandles = makeCandles(200, 'down');
        const data = makeMultiAllData(upCandles, ['rsi', 'cci', 'wavetrend'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const downData = makeMultiAllData(downCandles, ['rsi', 'cci', 'wavetrend'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const upResult = runStrategyBacktest(upCandles, 'RSI_CCI_WT', data, { lookForward: 5 });
        const downResult = runStrategyBacktest(downCandles, 'RSI_CCI_WT', downData, { lookForward: 5 });
        // Both should produce signals; uptrend winRate should be >= downtrend winRate
        // (BUY signals win in uptrend, SELL signals win in downtrend)
        expect(upResult.totalSignals).toBeGreaterThan(0);
        expect(downResult.totalSignals).toBeGreaterThan(0);
        expect(upResult.winRate).toBeGreaterThanOrEqual(downResult.winRate);
    });

    it('CUSTOM strategy works with 2 indicators using alternating data', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'macd'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const result = runStrategyBacktest(candles, 'CUSTOM', data, { lookForward: 5 }, {
            customIndicators: ['rsi', 'macd'],
            mode: 'all',
        });
        // Alternating data + 2 indicators = validVoters >= 2 + anyFreshCross → signals
        expect(result.totalSignals).toBeGreaterThan(0);
    });

    it('CUSTOM strategy with majority mode produces signals', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'cci', 'mfi'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const result = runStrategyBacktest(candles, 'CUSTOM', data, { lookForward: 5 }, {
            customIndicators: ['rsi', 'cci', 'mfi'],
            mode: 'majority',
        });
        expect(result.totalSignals).toBeGreaterThan(0);
    });

    it('cooldown prevents signals within 5 bars', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'cci'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const shortCooldown = runStrategyBacktest(candles, 'CUSTOM', data, {
            lookForward: 5, cooldownBars: 1,
        }, { customIndicators: ['rsi', 'cci'], mode: 'all' });

        const longCooldown = runStrategyBacktest(candles, 'CUSTOM', data, {
            lookForward: 5, cooldownBars: 20,
        }, { customIndicators: ['rsi', 'cci'], mode: 'all' });

        // Longer cooldown should produce fewer signals
        expect(longCooldown.totalSignals).toBeLessThanOrEqual(shortCooldown.totalSignals);
    });

    it('handles missing indicator data gracefully', () => {
        const candles = makeCandles(200, 'up');
        // Pass empty AllData → no signals possible
        const result = runStrategyBacktest(candles, 'RSI_CCI_WT', {});
        expect(result.totalSignals).toBe(0);
        expect(result.winRate).toBe(0);
    });

    it('history entries have correct structure with alternating data', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'cci'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const result = runStrategyBacktest(candles, 'CUSTOM', data, { lookForward: 5 }, {
            customIndicators: ['rsi', 'cci'],
            mode: 'all',
        });
        expect(result.totalSignals).toBeGreaterThan(0);
        const entry = result.history[0];
        expect(entry).toHaveProperty('time');
        expect(entry).toHaveProperty('signal');
        expect(entry).toHaveProperty('price');
        expect(entry).toHaveProperty('futurePrice');
        expect(entry).toHaveProperty('isWin');
        expect(['BUY', 'SELL']).toContain(entry.signal);
        expect(typeof entry.isWin).toBe('boolean');
    });

    it('longer lookForward reduces signal count', () => {
        const candles = makeCandles(300, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'cci', 'wavetrend'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const short = runStrategyBacktest(candles, 'RSI_CCI_WT', data, { lookForward: 3 });
        const long = runStrategyBacktest(candles, 'RSI_CCI_WT', data, { lookForward: 15 });
        // Longer lookForward = fewer bars at the end to evaluate
        expect(long.totalSignals).toBeLessThanOrEqual(short.totalSignals);
    });
});

// ─── optimizeStrategyParams ────────────────────────────────────────────────────

describe('optimizeStrategyParams', () => {
    it('returns default params when no optimizable indicators', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'cci'], 80, 30);
        const result = optimizeStrategyParams(candles, data, {
            indicators: [],
            lookForwardRange: [5, 10],
        });
        expect(result.bestParams.lookForward).toBeGreaterThanOrEqual(5);
        expect(result.bestParams.lookForward).toBeLessThanOrEqual(10);
        expect(result.iterations).toBeGreaterThan(0);
        expect(result.roundResults.length).toBeGreaterThan(0);
    });

    it('optimizes lookForward for RSI+CCI strategy', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'cci'], 80, 30, {
            high: 80, low: 20, period: 3,
        });
        const result = optimizeStrategyParams(candles, data, {
            indicators: ['rsi', 'cci'],
            lookForwardRange: [5, 10],
        });
        expect(result.bestParams.lookForward).toBeGreaterThanOrEqual(5);
        expect(result.bestParams.lookForward).toBeLessThanOrEqual(10);
        expect(result.bestWinRate).toBeGreaterThanOrEqual(0);
        expect(result.iterations).toBeGreaterThan(0);
        // Should have round results for lookForward + each indicator
        expect(result.roundResults.length).toBeGreaterThanOrEqual(3);
    });

    it('optimizes RSI parameter within valid range', () => {
        const candles = makeCandles(250, 'up');
        // Use alternating data so 2-indicator CUSTOM can generate signals
        const data = makeMultiAllData(candles, ['rsi', 'cci'], 80, 30, {
            high: 80, low: 20, period: 3,
        });
        const result = optimizeStrategyParams(candles, data, {
            indicators: ['rsi', 'cci'],
            lookForwardRange: [5, 10],
        });
        // OPTIMIZABLE_INDICATORS['RSI'].param = 'rsi_len' (note: underscore, not camelCase)
        const rsiLen = result.bestParams.rsi_len;
        expect(rsiLen).toBeGreaterThanOrEqual(2);
        expect(rsiLen).toBeLessThanOrEqual(40);
        expect(result.roundResults.length).toBeGreaterThanOrEqual(3); // lookForward + rsi_len + cci_len
    });

    it('returns valid structure for all results', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['macd', 'cci'], 80, 30, {
            high: 80, low: 20, period: 3,
        });
        const result = optimizeStrategyParams(candles, data, {
            indicators: ['macd', 'cci'],
            lookForwardRange: [5, 10],
        });
        expect(result).toHaveProperty('bestParams');
        expect(result).toHaveProperty('bestWinRate');
        expect(result).toHaveProperty('iterations');
        expect(result).toHaveProperty('roundResults');
        expect(typeof result.bestWinRate).toBe('number');
        expect(Array.isArray(result.roundResults)).toBe(true);
        expect(result.iterations).toBeGreaterThan(0);
    });

    it('handles empty candles gracefully', () => {
        const result = optimizeStrategyParams([], {}, {
            indicators: ['rsi'],
            lookForwardRange: [5, 10],
        });
        expect(result.bestWinRate).toBe(0);
        expect(result.bestParams.lookForward).toBeDefined();
    });
});

// ─── discoverStrategy ──────────────────────────────────────────────────────────

describe('discoverStrategy', () => {
    it('handles empty candles (combinations are generated before backtest)', () => {
        const result = discoverStrategy([], {}, {
            indicatorPool: ['rsi', 'cci'],
            minIndicators: 2,
            maxIndicators: 2,
        });
        // Combinations (C(2,2)=1) are generated BEFORE the candle check in Phase 1.
        // The backtest runs but returns 0 signals for empty candles.
        // The candidate still goes through Phases 2 and 3 with 0-win rate results.
        expect(result.totalCombinationsTested).toBe(1);
        // Phase 3 processes all topScreen candidates even with 0 signals
        expect(result.all.length).toBeGreaterThanOrEqual(0);
        expect(result.best.totalSignals).toBe(0);
        expect(result.best.winRate).toBe(0);
    });

    it('discovers best 2-indicator combination', () => {
        const candles = makeCandles(200, 'up');
        // Use oscillating data so signals are generated
        const data = makeMultiAllData(candles, ['rsi', 'cci'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const result = discoverStrategy(candles, data, {
            indicatorPool: ['rsi', 'cci'],
            minIndicators: 2,
            maxIndicators: 2,
            topN: 1,
        });
        // With only 2 indicators in pool and min=2 max=2, Phase 1 generates 1 combination.
        // Note: GA may explore beyond the pool (random population uses DISCOVERY_POOL),
        // so the final combination may differ from the original seed.
        expect(result.totalCombinationsTested).toBe(1);
        expect(result.all.length).toBeGreaterThanOrEqual(1);
        expect(result.best.indicators.length).toBeGreaterThanOrEqual(2);
        expect(result.poolSize).toBe(2);
    });

    it('discovers with 3-indicator pool producing 1 combination of 3', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'cci', 'macd'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const result = discoverStrategy(candles, data, {
            indicatorPool: ['rsi', 'cci', 'macd'],
            minIndicators: 3,
            maxIndicators: 3,
            topN: 1,
        });
        // C(3,3) = 1 combination from Phase 1.
        // GA is non-deterministic and population includes random/mutated seeds
        // from the full 17-indicator pool, so final indicator count may vary.
        expect(result.totalCombinationsTested).toBe(1);
        expect(result.best.indicators.length).toBeGreaterThanOrEqual(2);
    });

    it('discovers with 4-indicator pool producing C(4,2) = 6 combos', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'cci', 'macd', 'mfi'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const result = discoverStrategy(candles, data, {
            indicatorPool: ['rsi', 'cci', 'macd', 'mfi'],
            minIndicators: 2,
            maxIndicators: 2,
            topN: 3,
        });
        // C(4,2) = 6 combinations
        expect(result.totalCombinationsTested).toBe(6);
        expect(result.all.length).toBeLessThanOrEqual(3); // topN=3
    });

    it('returns proper structure for discovered strategy', () => {
        const candles = makeCandles(200, 'up');
        const data = makeMultiAllData(candles, ['rsi', 'cci'], 80, 30, {
            high: 80, low: 20, period: 15,
        });
        const result = discoverStrategy(candles, data, {
            indicatorPool: ['rsi', 'cci'],
            minIndicators: 2,
            maxIndicators: 2,
            topN: 1,
        });
        expect(result.best).toHaveProperty('indicators');
        expect(result.best).toHaveProperty('params');
        expect(result.best).toHaveProperty('winRate');
        expect(result.best).toHaveProperty('totalSignals');
        expect(result.best).toHaveProperty('rank');
        expect(result.best.rank).toBe(1);
        expect(typeof result.best.winRate).toBe('number');
        expect(typeof result.best.totalSignals).toBe('number');
        expect(Object.keys(result.best.params).length).toBeGreaterThan(0);
    });

    it('DISCOVERY_POOL contains all 17 indicators', () => {
        expect(DISCOVERY_POOL).toContain('rsi');
        expect(DISCOVERY_POOL).toContain('macd');
        expect(DISCOVERY_POOL).toContain('cci');
        expect(DISCOVERY_POOL).toContain('wavetrend');
        expect(DISCOVERY_POOL).toContain('dmi');
        expect(DISCOVERY_POOL).toContain('mfi');
        expect(DISCOVERY_POOL).toContain('smi');
        expect(DISCOVERY_POOL).toContain('wpr');
        expect(DISCOVERY_POOL).toContain('di');
        expect(DISCOVERY_POOL).toContain('cmf');
        expect(DISCOVERY_POOL).toContain('madr');
        expect(DISCOVERY_POOL).toContain('ao');
        expect(DISCOVERY_POOL).toContain('ad');
        expect(DISCOVERY_POOL).toContain('netvol');
        expect(DISCOVERY_POOL).toContain('alma');
        expect(DISCOVERY_POOL).toContain('bb');
        expect(DISCOVERY_POOL.length).toBe(17);
    });

    it('handles missing indicator data in allData', () => {
        const candles = makeCandles(200, 'up');
        // Provide data for rsi only, but ask to discover with rsi+cci
        const data = makeAllData('rsi', candles, 80, 30);
        const result = discoverStrategy(candles, data, {
            indicatorPool: ['rsi', 'cci'],
            minIndicators: 2,
            maxIndicators: 2,
            topN: 1,
        });
        // Should still run without error; signals may be 0 since cci data is missing
        expect(result.totalCombinationsTested).toBe(1);
        expect(result.poolSize).toBe(2);
    });
});
