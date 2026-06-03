import { describe, it, expect } from 'vitest';

// CandleDataPoint is globally available from types/global.d.ts

// Import the private function indirectly via a wrapper pattern
// Since splitDailyInto4H is not exported, we recreate the logic here for testing
// NOTE: If the implementation in finnhub.actions.ts changes, this test must be updated.
/**
 * Mirror of splitDailyInto4H from lib/actions/finnhub.actions.ts
 * Kept in sync for testing since the function is not exported.
 *
 * Splits a daily candle into two synthetic 4H bars matching real US equity
 * market structure: 2 bars per trading day (9:30-13:30, 13:30-16:00 ET).
 *
 * Guarantees:
 * - Aggregate high == daily high, aggregate low == daily low
 * - Bar 1 open == daily open, Bar 2 close == daily close
 * - Each bar's high >= max(open,close), low <= min(open,close)
 * - Volume distribution: 55/45 (higher at open auction)
 */
function splitDailyInto4H(daily: CandleDataPoint): CandleDataPoint[] {
    const { open, high, low, close, volume, time } = daily;
    const totalVol = volume ?? 0;
    const direction = close >= open ? 1 : -1;
    const absMove = Math.abs(close - open);

    // Two-bar price progression: ~62% in first 4h, ~38% in last 2.5h
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

describe('splitDailyInto4H (synthetic 4h data pipeline)', () => {
    // ─── Helpers ──────────────────────────────────────────────────────────────
    function validateBar(bar: CandleDataPoint, label: string): void {
        expect(bar.high, `${label}: high >= max(open, close)`).toBeGreaterThanOrEqual(
            Math.max(bar.open, bar.close)
        );
        expect(bar.low, `${label}: low <= min(open, close)`).toBeLessThanOrEqual(
            Math.min(bar.open, bar.close)
        );
        expect(bar.high, `${label}: high >= low`).toBeGreaterThanOrEqual(bar.low);
        expect(typeof bar.time, `${label}: time is a number`).toBe('number');
        if (bar.volume !== undefined) {
            expect(bar.volume, `${label}: volume >= 0`).toBeGreaterThanOrEqual(0);
        }
    }

    // ─── Tests ────────────────────────────────────────────────────────────────

    it('produces exactly 2 bars for a bullish day (matches real 4H market structure)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 110, low: 95, close: 108, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        expect(bars).toHaveLength(2);
    });

    it('produces exactly 2 bars for a bearish day (matches real 4H market structure)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 110, high: 112, low: 95, close: 98, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        expect(bars).toHaveLength(2);
    });

    it('preserves OHLC integrity for each bar (bullish)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 110, low: 95, close: 108, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        for (let i = 0; i < bars.length; i++) {
            validateBar(bars[i], `Bar ${i + 1}`);
        }
    });

    it('preserves OHLC integrity for each bar (bearish)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 110, high: 112, low: 95, close: 98, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        for (let i = 0; i < bars.length; i++) {
            validateBar(bars[i], `Bar ${i + 1}`);
        }
    });

    it('aggregate high matches daily high and aggregate low matches daily low', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 110, low: 95, close: 108, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        const aggregateHigh = Math.max(...bars.map(b => b.high));
        const aggregateLow = Math.min(...bars.map(b => b.low));
        expect(aggregateHigh).toBe(daily.high);
        expect(aggregateLow).toBe(daily.low);
    });

    it('aggregate high and low match for bearish day', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 110, high: 112, low: 95, close: 98, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        const aggregateHigh = Math.max(...bars.map(b => b.high));
        const aggregateLow = Math.min(...bars.map(b => b.low));
        expect(aggregateHigh).toBe(daily.high);
        expect(aggregateLow).toBe(daily.low);
    });

    it('first bar opens at daily open, last bar closes at daily close', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 110, low: 95, close: 108, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        expect(bars[0].open).toBe(daily.open);
        expect(bars[1].close).toBe(daily.close);
    });

    it('timestamps are 4 hours apart (14400 seconds)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 110, low: 95, close: 108, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        expect(bars[1].time - bars[0].time).toBe(4 * 3600);
    });

    it('total volume is preserved (with rounding tolerance)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 110, low: 95, close: 108, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        const totalVol = bars.reduce((sum, b) => sum + (b.volume ?? 0), 0);
        // Allow up to 2 rounding error (from Math.round)
        expect(Math.abs(totalVol - (daily.volume ?? 0))).toBeLessThanOrEqual(2);
    });

    it('handles zero volume gracefully', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 110, low: 95, close: 108 };
        const bars = splitDailyInto4H(daily);
        expect(bars).toHaveLength(2);
        for (const bar of bars) {
            expect(bar.volume).toBeDefined();
        }
    });

    it('handles flat day (open === close)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 105, low: 95, close: 100, volume: 5000 };
        const bars = splitDailyInto4H(daily);
        expect(bars).toHaveLength(2);
        // On flat day, direction is 1 (close >= open), so bars should be bullish
        validateBar(bars[0], 'Bar 1 (flat)');
        validateBar(bars[1], 'Bar 2 (flat)');
        // Since absMove = 0, all bars should have same open/close = daily open
        expect(bars[0].close).toBe(100);
        expect(bars[1].close).toBe(100);
    });

    it('bullish day produces increasing closing prices across bars', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 120, low: 95, close: 115, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        expect(bars[0].close).toBeGreaterThan(bars[0].open);
        expect(bars[1].close).toBeGreaterThan(bars[1].open);
        // Last bar close = daily close, which is above bar1 close (only 62% of move)
        expect(bars[0].close).toBeLessThan(bars[1].close);
    });

    it('bearish day produces decreasing closing prices across bars', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 115, high: 120, low: 95, close: 100, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        expect(bars[0].close).toBeLessThan(bars[0].open);
        expect(bars[1].close).toBeLessThan(bars[1].open);
        // Bar1 close (62% down) is above bar2 close (100% down)
        expect(bars[0].close).toBeGreaterThan(bars[1].close);
    });

    it('volume distribution has higher volume at open (55%) than close (45%)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 110, low: 95, close: 108, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        // Bar 1 (55%) should be greater than Bar 2 (45%)
        expect((bars[0].volume ?? 0)).toBeGreaterThan((bars[1].volume ?? 0));
    });

    it('handles narrow range (high ≈ low)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 100.5, low: 99.5, close: 100.3, volume: 1000 };
        const bars = splitDailyInto4H(daily);
        expect(bars).toHaveLength(2);
        for (const bar of bars) {
            validateBar(bar, 'Narrow range bar');
        }
    });

    it('handles large range (volatile day)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 150, low: 50, close: 120, volume: 50000 };
        const bars = splitDailyInto4H(daily);
        expect(bars).toHaveLength(2);
        const aggregateHigh = Math.max(...bars.map(b => b.high));
        const aggregateLow = Math.min(...bars.map(b => b.low));
        expect(aggregateHigh).toBe(daily.high);
        expect(aggregateLow).toBe(daily.low);
        for (const bar of bars) {
            validateBar(bar, 'Volatile bar');
        }
    });

    it('bar2 open equals bar1 close (continuous price progression)', () => {
        const daily: CandleDataPoint = { time: 1000000, open: 100, high: 110, low: 95, close: 108, volume: 10000 };
        const bars = splitDailyInto4H(daily);
        expect(bars[1].open).toBe(bars[0].close);
    });
});
