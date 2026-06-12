import { describe, it, expect } from 'vitest';
import { simulateTrade, type TradeRiskConfig } from '@/lib/ta/simulation/trade-simulator';
import type { Candle } from '@/lib/ta/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create synthetic candles from close prices. OHLC derived from close. */
function makeCandles(prices: number[]): Candle[] {
    return prices.map((close, i) => ({
        time: `2024-01-${String(i + 1).padStart(2, '0')}`,
        close,
        high: close * 1.01,
        low: close * 0.99,
        open: close,
        volume: 1000000,
    }));
}

/** Create constant ATR array. */
function makeATR(length: number, value: number): number[] {
    return Array(length).fill(value);
}

/** Default risk config for tests */
const defaultRisk: TradeRiskConfig = {
    stopLossAtrMult: 2.0,
    takeProfitR: 2.0,
    useTrailingStop: false,
    trailAtrMult: 0,
    timeStopBars: 20,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('simulateTrade', () => {
    // ─── THE KEY BUG FIX ─────────────────────────────────────────────────────
    it('stop-loss: price dips below stop → LOSS even if it later recovers', () => {
        // Price path: 100 → 98 → 95 → 94 → 96 → 100 → 105 → 110 → 115 → 120
        // With ATR=5, SL 1×ATR → SL = 100 - 5 = 95
        // Price hits 94 (below 95) → should exit at stop-loss = LOSS
        // Old system would compare entry=100 vs future[+9]=120 → WIN (wrong!)
        const prices = [100, 98, 95, 94, 96, 100, 105, 110, 115, 120];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 5);

        const result = simulateTrade(candles, 0, 'BUY', atr, {
            stopLossAtrMult: 1.0,   // SL = 100 - 5*1 = 95
            takeProfitR: 3.0,        // TP = 100 + 5*3 = 115
            useTrailingStop: false,
            trailAtrMult: 0,
            timeStopBars: 20,
        });

        // Price 95 at bar 2 <= SL 95 → stop-loss triggered
        expect(result.exitReason).toBe('stop_loss');
        expect(result.realizedReturnPct).toBeLessThan(0);
        // Exit at bar 2 (price = 95, SL = 95, 95 <= 95 triggers)
        expect(result.exitIndex).toBe(2);
    });

    // ─── TAKE PROFIT ─────────────────────────────────────────────────────────
    it('take-profit: price reaches TP → WIN', () => {
        // ATR=3, SL 1.5×ATR = 4.5, stopDistance=4.5, TP = entry + 4.5*2 = 109
        const prices = [100, 102, 105, 108, 110, 112, 115];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 3);

        const result = simulateTrade(candles, 0, 'BUY', atr, {
            stopLossAtrMult: 1.5,   // SL = 100 - 4.5 = 95.5
            takeProfitR: 2.0,        // TP = 100 + 4.5*2 = 109
            useTrailingStop: false,
            trailAtrMult: 0,
            timeStopBars: 20,
        });

        expect(result.exitReason).toBe('take_profit');
        expect(result.realizedReturnPct).toBeGreaterThan(0);
    });

    // ─── TIME STOP ───────────────────────────────────────────────────────────
    it('time-stop: no SL/TP hit → exits at timeStopBars', () => {
        // Price oscillates gently, never hits wide SL or TP
        const prices = [100, 101, 100, 101, 100, 101, 100, 101];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 1);

        const result = simulateTrade(candles, 0, 'BUY', atr, {
            stopLossAtrMult: 10.0,  // Very wide SL (won't hit)
            takeProfitR: 10.0,       // Very wide TP (won't hit)
            useTrailingStop: false,
            trailAtrMult: 0,
            timeStopBars: 5,         // Exit after 5 bars
        });

        expect(result.exitReason).toBe('time_stop');
        expect(result.barsHeld).toBe(5);
        expect(result.exitIndex).toBe(5);
    });

    // ─── SELL DIRECTION ──────────────────────────────────────────────────────
    it('SELL: profit when price goes down', () => {
        // SELL at 100, price drops → should be profitable
        const prices = [100, 98, 95, 93, 90, 88];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 3);

        // SL = 100 + 3*2 = 106, TP = 100 - 6*2 = 88
        const result = simulateTrade(candles, 0, 'SELL', atr, {
            stopLossAtrMult: 2.0,
            takeProfitR: 2.0,
            useTrailingStop: false,
            trailAtrMult: 0,
            timeStopBars: 20,
        });

        expect(result.realizedReturnPct).toBeGreaterThan(0);
        expect(result.exitReason).toBe('take_profit');
    });

    it('SELL: stop-loss when price goes up', () => {
        // SELL at 100, price rises → should hit stop-loss
        const prices = [100, 102, 104, 107, 110];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 3);

        // SL = 100 + 3*2 = 106
        const result = simulateTrade(candles, 0, 'SELL', atr, {
            stopLossAtrMult: 2.0,
            takeProfitR: 3.0,
            useTrailingStop: false,
            trailAtrMult: 0,
            timeStopBars: 20,
        });

        expect(result.exitReason).toBe('stop_loss');
        expect(result.realizedReturnPct).toBeLessThan(0);
    });

    // ─── MFE / MAE TRACKING ──────────────────────────────────────────────────
    it('MFE and MAE are tracked correctly', () => {
        // Price: 100 → 110 (MFE +10%) → 90 (MAE -10%) → 100 (time stop)
        const prices = [100, 105, 110, 100, 95, 90, 95, 100];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 2);

        const result = simulateTrade(candles, 0, 'BUY', atr, {
            stopLossAtrMult: 10.0,  // Very wide — won't trigger
            takeProfitR: 10.0,
            useTrailingStop: false,
            trailAtrMult: 0,
            timeStopBars: 7,
        });

        expect(result.exitReason).toBe('time_stop');
        // MFE: best was +10% at price 110
        expect(result.mfe).toBeCloseTo(10, 0);
        // MAE: worst was -10% at price 90
        expect(result.mae).toBeCloseTo(-10, 0);
        // Intra-trade drawdown: from +10% peak to -10% trough = 20%
        expect(result.intraTradeMaxDD).toBeCloseTo(20, 0);
    });

    // ─── TRAILING STOP ───────────────────────────────────────────────────────
    it('trailing stop: locks in profit as price rises then drops', () => {
        // Price: 100 → 105 → 110 → 115 → 108 (trailing fires)
        // Trail ATR mult = 1.0, ATR = 5 → trail from peak 115 - 5 = 110
        // Price 108 < 110 → trailing stop
        const prices = [100, 105, 110, 115, 108, 100];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 5);

        const result = simulateTrade(candles, 0, 'BUY', atr, {
            stopLossAtrMult: 3.0,   // SL = 100 - 15 = 85 (won't hit)
            takeProfitR: 5.0,        // TP = 100 + 75 = 175 (won't hit)
            useTrailingStop: true,
            trailAtrMult: 1.0,       // Trail = peak - 5*1 = peak - 5
            timeStopBars: 20,
        });

        expect(result.exitReason).toBe('trailing_stop');
        expect(result.realizedReturnPct).toBeGreaterThan(0); // Still profitable
    });

    // ─── OPPOSITE SIGNAL ─────────────────────────────────────────────────────
    it('opposite signal: exits when callback returns true', () => {
        const prices = [100, 102, 104, 106, 108, 110];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 5);

        // Opposite signal fires at bar 3
        const result = simulateTrade(candles, 0, 'BUY', atr, {
            ...defaultRisk,
            stopLossAtrMult: 10.0,
            takeProfitR: 10.0,
        }, (barIndex) => barIndex === 3);

        expect(result.exitReason).toBe('opposite_signal');
        expect(result.exitIndex).toBe(3);
        expect(result.barsHeld).toBe(3);
    });

    // ─── EDGE CASES ──────────────────────────────────────────────────────────
    it('handles entry at last available bar gracefully', () => {
        const prices = [100, 105];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 5);

        // Entry at bar 0, timeStopBars = 1, only bar 1 available
        const result = simulateTrade(candles, 0, 'BUY', atr, {
            ...defaultRisk,
            timeStopBars: 1,
        });

        expect(result.barsHeld).toBe(1);
        expect(result.exitIndex).toBe(1);
    });

    it('barsHeld is correct', () => {
        const prices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
        const candles = makeCandles(prices);
        const atr = makeATR(prices.length, 1);

        const result = simulateTrade(candles, 0, 'BUY', atr, {
            stopLossAtrMult: 10.0,
            takeProfitR: 10.0,
            useTrailingStop: false,
            trailAtrMult: 0,
            timeStopBars: 7,
        });

        expect(result.exitReason).toBe('time_stop');
        expect(result.barsHeld).toBe(7);
    });
});
