import { describe, it, expect } from 'vitest';
import { runPortfolioSimulation, resampleCurve, type PortfolioSimConfig, type PortfolioSignalEntry } from '@/lib/ta/simulation/portfolio-simulator';
import type { Candle } from '@/lib/ta/simulation/backtest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCandles(prices: number[]): Candle[] {
    return prices.map((close, i) => ({
        time: `2024-01-${String(i + 1).padStart(2, '0')}`,
        close,
        high: close,
        low: close,
        open: close,
    }));
}

const defaultConfig: PortfolioSimConfig = {
    initialCapital: 10000,
    positionSizePct: 100,
    commissionBps: 0,
    slippageBps: 0,
    allowCompounding: true,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runPortfolioSimulation', () => {

    it('compounds correctly over consecutive wins (zero costs)', () => {
        // Price: 100 → 110 (+10%), 110 → 121 (+10%)
        // Starting 10,000 → 11,000 → 12,100
        const candles = makeCandles([100, 110, 121]);
        
        const signals: PortfolioSignalEntry[] = [
            {
                barIndex: 0,
                signal: 'BUY',
                simulatedTrade: {
                    entryIndex: 0,
                    exitIndex: 1,
                    exitReason: 'take_profit',
                    entryPrice: 100,
                    exitPrice: 110,
                    realizedReturnPct: 10, // 10%
                    mfe: 10, mae: 0, intraTradeMaxDD: 0, barsHeld: 1
                }
            },
            {
                barIndex: 1,
                signal: 'BUY',
                simulatedTrade: {
                    entryIndex: 1,
                    exitIndex: 2,
                    exitReason: 'take_profit',
                    entryPrice: 110,
                    exitPrice: 121,
                    realizedReturnPct: 10, // 10%
                    mfe: 10, mae: 0, intraTradeMaxDD: 0, barsHeld: 1
                }
            }
        ];

        const result = runPortfolioSimulation(candles, signals, defaultConfig);

        expect(result.totalTrades).toBe(2);
        expect(result.winningTrades).toBe(2);
        expect(result.winRate).toBe(100);
        expect(result.finalEquity).toBeCloseTo(12100, 2);
        expect(result.totalReturnPct).toBeCloseTo(21, 2); // 21% total return
    });

    it('applies commission and slippage deterministically', () => {
        // Price: 100 → 110 (+10% raw return)
        // With 50 bps commission and 50 bps slippage per side
        // Total cost per side = 100 bps = 1%. Total costs = ~2%
        // Net return should be ~8% rather than 10%
        const candles = makeCandles([100, 110]);
        
        const signals: PortfolioSignalEntry[] = [
            {
                barIndex: 0,
                signal: 'BUY',
                simulatedTrade: {
                    entryIndex: 0,
                    exitIndex: 1,
                    exitReason: 'take_profit',
                    entryPrice: 100,
                    exitPrice: 110,
                    realizedReturnPct: 10,
                    mfe: 10, mae: 0, intraTradeMaxDD: 0, barsHeld: 1
                }
            }
        ];

        const config = { ...defaultConfig, commissionBps: 50, slippageBps: 50 };
        const result = runPortfolioSimulation(candles, signals, config);

        // 10000 * 0.01 entry cost = 100. Allocated = 10000.
        // Gross exit = 10000 * 1.10 = 11000
        // Exit cost = 11000 * 0.01 = 110.
        // Net PnL = 11000 - 10000 - 100 - 110 = 790
        // Final equity = 10790
        expect(result.finalEquity).toBeCloseTo(10790, 2);
    });

    it('tracks drawdown correctly', () => {
        // Price: 100 → 200 (100% gain) → 100 (-50% loss)
        // Peak equity = 20,000. Final equity = 10,000.
        // Drawdown should hit 50%.
        const candles = makeCandles([100, 200, 100]);
        
        const signals: PortfolioSignalEntry[] = [
            {
                barIndex: 0,
                signal: 'BUY',
                simulatedTrade: {
                    entryIndex: 0,
                    exitIndex: 1,
                    exitReason: 'time_stop',
                    entryPrice: 100,
                    exitPrice: 200,
                    realizedReturnPct: 100,
                    mfe: 100, mae: 0, intraTradeMaxDD: 0, barsHeld: 1
                }
            },
            {
                barIndex: 1,
                signal: 'BUY',
                simulatedTrade: {
                    entryIndex: 1,
                    exitIndex: 2,
                    exitReason: 'time_stop',
                    entryPrice: 200,
                    exitPrice: 100,
                    realizedReturnPct: -50,
                    mfe: 0, mae: -50, intraTradeMaxDD: 50, barsHeld: 1
                }
            }
        ];

        const result = runPortfolioSimulation(candles, signals, defaultConfig);

        expect(result.maxDrawdownPct).toBeCloseTo(50, 2);
    });

    it('equity curve length matches candles length exactly', () => {
        const candles = makeCandles([100, 100, 100, 100, 100]); // length 5
        const result = runPortfolioSimulation(candles, [], defaultConfig);

        expect(result.equityCurve.length).toBe(5);
        expect(result.drawdownCurve.length).toBe(5);
        // No trades = flat equity
        expect(result.finalEquity).toBe(10000);
        expect(result.totalTrades).toBe(0);
    });

    it('respects positionSizePct', () => {
        // 50% position size. Start 10,000.
        // Allocate 5,000. Gain 100% on it = 5,000 profit.
        // Final equity = 15,000.
        const candles = makeCandles([100, 200]);
        const signals: PortfolioSignalEntry[] = [
            {
                barIndex: 0,
                signal: 'BUY',
                simulatedTrade: {
                    entryIndex: 0,
                    exitIndex: 1,
                    exitReason: 'time_stop',
                    entryPrice: 100,
                    exitPrice: 200,
                    realizedReturnPct: 100,
                    mfe: 100, mae: 0, intraTradeMaxDD: 0, barsHeld: 1
                }
            }
        ];

        const config = { ...defaultConfig, positionSizePct: 50 };
        const result = runPortfolioSimulation(candles, signals, config);

        expect(result.finalEquity).toBeCloseTo(15000, 2);
    });
});

describe('resampleCurve', () => {
    it('returns original array if smaller than target', () => {
        const arr = [1, 2, 3];
        expect(resampleCurve(arr, 10)).toEqual([1, 2, 3]);
    });

    it('resamples down to exact target length', () => {
        const arr = Array.from({ length: 100 }, (_, i) => i);
        const resampled = resampleCurve(arr, 10);
        
        expect(resampled.length).toBe(10);
        expect(resampled[0]).toBe(0);
        expect(resampled[9]).toBe(99);
    });
});
