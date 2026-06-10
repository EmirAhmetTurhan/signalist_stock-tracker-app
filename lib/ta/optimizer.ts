import { computeRSI } from "@/lib/indicators/rsi";
import { computeMACD } from "@/lib/indicators/macd";
import { computeMFI } from "@/lib/indicators/mfi";
import { computeCCI } from "@/lib/indicators/cci";
import { computeWPR } from "@/lib/indicators/wpr";
import { computeStochRSI } from "@/lib/indicators/stochrsi";
import { computeWaveTrend } from "@/lib/indicators/wavetrend";
import { computeDMI } from "@/lib/indicators/dmi";
import { computeSMI } from "@/lib/indicators/smi";
import { computeDemandIndex } from "@/lib/indicators/demand_index";
import { computeCMF } from "@/lib/indicators/cmf";
import { computeMADR } from "@/lib/indicators/madr";
import { computeALMA } from "@/lib/indicators/alma";
import { computeBollingerBands } from "@/lib/indicators/bollinger";
import { calculateWinRate, type Candle } from "@/lib/ta/simulation/backtest";
import type { RSIInput, RSIOutput } from "@/lib/indicators/rsi";
import type { MACDInput, MACDOutput } from "@/lib/indicators/macd";
import type { MFIInput, MFIPoint } from "@/lib/indicators/mfi";
import type { CCIInput, CCIOutput } from "@/lib/indicators/cci";
import type { WPRInput, WPRPoint } from "@/lib/indicators/wpr";
import type { StochRsiInput, StochRsiOutput } from "@/lib/indicators/stochrsi";
import type { WTInput, WTPoint } from "@/lib/indicators/wavetrend";
import type { DMIInput, DMIPoint } from "@/lib/indicators/dmi";
import type { SMIInput, SMIPoint } from "@/lib/indicators/smi";
import type { DIInput, DIPoint } from "@/lib/indicators/demand_index";
import type { CMFInput, CMFPoint } from "@/lib/indicators/cmf";
import type { MADRInput, MADRPoint } from "@/lib/indicators/madr";

interface OptimizerEntry {
    param: string;
    range: [number, number];
    compute: (candles: Candle[], val: number) => unknown[];
    formatData: (res: unknown[]) => unknown;
}

// Helper: convert Candle to { time: number; close: number }
const toCloseInput = (c: Candle) => ({ time: c.time as number, close: c.close });
// Helper: convert Candle to { time: number; high: number; low: number; close: number }
const toHLCInput = (c: Candle) => ({ time: c.time as number, high: c.high, low: c.low, close: c.close });
// Helper: convert Candle to { time: number; high: number; low: number; close: number; volume: number }
const toHLCVInput = (c: Candle) => ({ time: c.time as number, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0 });
// Helper: convert Candle to { time: number; open: number; high: number; low: number; close: number; volume: number }
const toOHLCVInput = (c: Candle) => ({ time: c.time as number, high: c.high, low: c.low, close: c.close, open: c.open ?? 0, volume: c.volume ?? 0 });

export const OPTIMIZABLE_INDICATORS: Record<string, OptimizerEntry> = {
    "RSI": {
        param: "rsi_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input: RSIInput[] = candles.map(toCloseInput);
            return computeRSI(input, val, 14);
        },
        formatData: (res: unknown[]) => {
            const typed = res as RSIOutput[];
            return {
                rsi: typed.map(p => ({ time: p.time, value: typeof p.rsi === 'number' ? p.rsi : undefined })),
                ma: typed.map(p => ({ time: p.time, value: typeof p.ma === 'number' ? p.ma : undefined }))
            };
        }
    },
    "MACD": {
        param: "macd_fast",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input = candles.map(c => ({ time: c.time as number, close: c.close })) as unknown as MACDInput[];
            return computeMACD(input, val, 26, 9);
        },
        formatData: (res: unknown[]) => {
            const typed = res as MACDOutput[];
            return {
                macd: typed.map(p => ({ time: p.time, value: typeof p.macd === 'number' ? p.macd : undefined })),
                signal: typed.map(p => ({ time: p.time, value: typeof p.signal === 'number' ? p.signal : undefined })),
                histogram: typed.map(p => ({ time: p.time, value: typeof p.histogram === 'number' ? p.histogram : undefined }))
            };
        }
    },
    "STOCHRSI": {
        param: "stoch_rsi_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input: StochRsiInput[] = candles.map(toCloseInput);
            return computeStochRSI(input, val, 14, 3, 3);
        },
        formatData: (res: unknown[]) => {
            const typed = res as StochRsiOutput[];
            return {
                k: typed.map(p => ({ time: p.time, value: typeof p.k === 'number' ? p.k : undefined })),
                d: typed.map(p => ({ time: p.time, value: typeof p.d === 'number' ? p.d : undefined }))
            };
        }
    },
    "WAVETREND": {
        param: "wt_avg_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input = candles.map(toHLCInput) as unknown as WTInput[];
            return computeWaveTrend(input, 21, val, 4);
        },
        formatData: (res: unknown[]) => {
            const typed = res as WTPoint[];
            return {
                wt1: typed.map(p => ({ time: p.time, value: typeof p.wt1 === 'number' ? p.wt1 : undefined })),
                wt2: typed.map(p => ({ time: p.time, value: typeof p.wt2 === 'number' ? p.wt2 : undefined }))
            };
        }
    },
    "DMI": {
        param: "dmi_di_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input = candles.map(toHLCInput) as unknown as DMIInput[];
            return computeDMI(input, val, 14);
        },
        formatData: (res: unknown[]) => {
            const typed = res as DMIPoint[];
            return {
                plusDI: typed.map(p => ({ time: p.time, value: typeof p.plusDI === 'number' ? p.plusDI : undefined })),
                minusDI: typed.map(p => ({ time: p.time, value: typeof p.minusDI === 'number' ? p.minusDI : undefined })),
                adx: typed.map(p => ({ time: p.time, value: typeof p.adx === 'number' ? p.adx : undefined }))
            };
        }
    },
    "MFI": {
        param: "mfi_period",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input = candles.map(toHLCVInput) as unknown as MFIInput[];
            return computeMFI(input, val);
        },
        formatData: (res: unknown[]) => {
            const typed = res as MFIPoint[];
            return {
                mfi: typed.map(p => ({ time: p.time, value: typeof p.mfi === 'number' ? p.mfi : undefined }))
            };
        }
    },
    "SMI": {
        param: "smi_long_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input: SMIInput[] = candles.map(toHLCInput);
            return computeSMI(input, val, 5, 5);
        },
        formatData: (res: unknown[]) => {
            const typed = res as SMIPoint[];
            return {
                smi: typed.map(p => ({ time: p.time, value: typeof p.smi === 'number' ? p.smi : undefined })),
                signal: typed.map(p => ({ time: p.time, value: typeof p.signal === 'number' ? p.signal : undefined }))
            };
        }
    },
    "CCI": {
        param: "cci_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input: CCIInput[] = candles.map(toHLCInput);
            return computeCCI(input, val, 14);
        },
        formatData: (res: unknown[]) => {
            const typed = res as CCIOutput[];
            return {
                cci: typed.map(p => ({ time: p.time, value: typeof p.cci === 'number' ? p.cci : undefined })),
                ma: typed.map(p => ({ time: p.time, value: typeof p.ma === 'number' ? p.ma : undefined }))
            };
        }
    },
    "WPR": {
        param: "wpr_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input: WPRInput[] = candles.map(toHLCInput);
            return computeWPR(input, val);
        },
        formatData: (res: unknown[]) => {
            const typed = res as WPRPoint[];
            return typed.map(p => ({ time: p.time, value: p.value }));
        }
    },
    "DI": {
        param: "di_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input = candles.map(toOHLCVInput) as unknown as DIInput[];
            return computeDemandIndex(input, val);
        },
        formatData: (res: unknown[]) => {
            const typed = res as DIPoint[];
            return typed.map(p => ({ time: p.time, value: p.value }));
        }
    },
    "CMF": {
        param: "cmf_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input = candles.map(toHLCVInput) as unknown as CMFInput[];
            return computeCMF(input, val);
        },
        formatData: (res: unknown[]) => {
            const typed = res as CMFPoint[];
            return typed.map(p => ({ time: p.time, value: p.value }));
        }
    },
    "MADR": {
        param: "madr_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => {
            const input: MADRInput[] = candles.map(toCloseInput);
            return computeMADR(input, val);
        },
        formatData: (res: unknown[]) => {
            const typed = res as MADRPoint[];
            return typed.map(p => ({ time: p.time, value: p.value }));
        }
    },
    "ALMA": {
        param: "alma_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) =>
            computeALMA(candles.map(c => ({ time: c.time, close: c.close })), val, 0.85, 6),
        formatData: (res: unknown[]) => {
            const typed = res as { time: string | number; value: number }[];
            return typed.map(p => ({ time: p.time, value: p.value }));
        }
    },
    "BOLLINGER": {
        param: "bb_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) =>
            computeBollingerBands(candles.map(c => ({ time: Number(c.time), close: c.close })), val, 2, 0),
        formatData: (res: unknown[]) => res
    }
};

// Add alias so both 'BB' (used by GA/strategy optimizer) and 'BOLLINGER' (legacy) resolve correctly
OPTIMIZABLE_INDICATORS['BB'] = OPTIMIZABLE_INDICATORS['BOLLINGER'];

// ─── SPRINT 2 / B2: Timeframe-Aware Lookback Range ────────────────────────

export function rangeForTimeframe(
    indicatorName: string,
    timeframe?: string
): [number, number] {
    const entry = OPTIMIZABLE_INDICATORS[indicatorName.toUpperCase()];
    if (!entry) return [1, 100];

    if (timeframe !== '4h') {
        return entry.range;
    }

    const RANGES_4H: Record<string, [number, number]> = {
        'RSI': [14, 42], 'STOCHRSI': [14, 42], 'DMI': [14, 42],
        'MFI': [14, 42], 'SMI': [14, 42], 'WPR': [14, 42],
        'DI': [14, 42], 'MADR': [14, 42], 'CCI': [14, 42],
        'CMF': [14, 42], 'BOLLINGER': [14, 42],
        'MACD': [10, 30], 'WAVETREND': [10, 30], 'ALMA': [10, 30],
    };

    return RANGES_4H[indicatorName.toUpperCase()] ?? entry.range;
}

/**
 * Brute-force optimizer: evaluates every parameter value in the indicator's
 * range on the FULL dataset and picks the one with the highest win rate.
 * No train/test split — we want the best possible parameter for the data we have.
 */
export function findBestParameter(
    indicatorName: string,
    candles: Candle[],
    config: { lookForward: number; interval?: string } = { lookForward: 5 }
): { bestVal: number; bestWinRate: number } | null {
    const optimizer = OPTIMIZABLE_INDICATORS[indicatorName];
    if (!optimizer) return null;

    let bestVal = -1;
    let bestWinRate = -1;
    let bestSignals = 0;

    const [start, end] = rangeForTimeframe(indicatorName, config.interval);
    for (let val = start; val <= end; val++) {
        const rawData = optimizer.compute(candles, val);
        const formattedData = optimizer.formatData(rawData);

        // Evaluate on full dataset — no train/test split
        const result = calculateWinRate(indicatorName, candles, formattedData, {
            ...config,
            interval: config.interval,
        });

        // Prefer higher win rate; on tie, prefer more signals (more robust)
        if (
            result.winRate > bestWinRate ||
            (result.winRate === bestWinRate && result.totalSignals > bestSignals)
        ) {
            bestWinRate = result.winRate;
            bestSignals = result.totalSignals;
            bestVal = val;
        }
    }

    if (bestVal === -1) return null;
    return { bestVal, bestWinRate };
}