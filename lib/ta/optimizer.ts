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
import { calculateWinRate, Candle } from "./backtest";
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
        range: [7, 28],
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
        range: [6, 24],
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
        range: [7, 28],
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
        range: [5, 20],
        compute: (candles: Candle[], val: number) => {
            const input = candles.map(toHLCInput) as unknown as WTInput[];
            return computeWaveTrend(input, val, 21, 4);
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
        range: [7, 28],
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
        range: [7, 28],
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
        range: [7, 28],
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
        range: [10, 30],
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
        range: [7, 28],
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
        range: [7, 28],
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
        range: [10, 30],
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
        range: [7, 28],
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
        range: [5, 18],
        compute: (candles: Candle[], val: number) =>
            computeALMA(candles.map(c => ({ time: c.time, close: c.close })), val, 0.85, 6),
        formatData: (res: unknown[]) => {
            const typed = res as { time: string | number; value: number }[];
            return typed.map(p => ({ time: p.time, value: p.value }));
        }
    },
    "BOLLINGER": {
        param: "bb_len",
        range: [10, 30],
        compute: (candles: Candle[], val: number) =>
            computeBollingerBands(candles.map(c => ({ time: Number(c.time), close: c.close })), val, 2, 0),
        formatData: (res: unknown[]) => res
    }
};

// Add alias so both 'BB' (used by GA/strategy optimizer) and 'BOLLINGER' (legacy) resolve correctly
OPTIMIZABLE_INDICATORS['BB'] = OPTIMIZABLE_INDICATORS['BOLLINGER'];

// ─── SPRINT 2 / B2: Timeframe-Aware Lookback Range ────────────────────────

/**
 * Swing trade için 4h timeframe'inde daha geniş lookback arama uzayı döner.
 * Literatür: Swing trade (3-14 gün) için 4h'da 14-bar lookback ~2.3 gün → çok kısa
 * gürültüyü yutar. 21-42 arası (3.5-7 gün) swing trade'in gerçek noise-filter
 * penceresine denk gelir.
 *
 * 1d ve 1wk timeframe'leri default range'i kullanır (zaten geniş).
 *
 * @param indicatorName - 'RSI', 'MACD', 'BB' vs. (büyük harf duyarsız)
 * @param timeframe - '4h' | '1d' | '1wk' (opsiyonel)
 * @returns [min, max] lookback aralığı
 */
export function rangeForTimeframe(
    indicatorName: string,
    timeframe?: string
): [number, number] {
    const entry = OPTIMIZABLE_INDICATORS[indicatorName.toUpperCase()];
    if (!entry) return [1, 100];

    // 1d ve 1wk için default range yeterli
    if (timeframe !== '4h') {
        return entry.range;
    }

    // SPRINT 2 / B2: 4h swing trade için genişletilmiş lookback uzayı.
    // Tipik swing trade pencere aralığı: 3-7 gün. 4h'da bu 18-42 buma denk gelir.
    // Böylece DE optimizer noise-filter yetersizliği nedeniyle overfit etmez.
    const RANGES_4H: Record<string, [number, number]> = {
        'RSI': [14, 42],         // 2.3 gün → 7 gün
        'STOCHRSI': [14, 42],
        'DMI': [14, 42],
        'MFI': [14, 42],
        'SMI': [14, 42],
        'WPR': [14, 42],
        'DI': [14, 42],
        'MADR': [14, 42],
        'CCI': [14, 42],
        'CMF': [14, 42],
        'BOLLINGER': [14, 42],
        'MACD': [10, 30],        // fast period (slow 26, signal 9 sabit)
        'WAVETREND': [10, 30],   // channel length (n1)
        'ALMA': [10, 30],
    };

    return RANGES_4H[indicatorName.toUpperCase()] ?? entry.range;
}

export function findBestParameter(
    indicatorName: string,
    candles: Candle[],
    config: { lookForward: number; interval?: string } = { lookForward: 5 }
): { bestVal: number; bestWinRate: number } | null {
    const optimizer = OPTIMIZABLE_INDICATORS[indicatorName];
    if (!optimizer) return null;

    // ── Train/Test Split (70/30) ──────────────────────────────────────
    const splitIdx = Math.floor(candles.length * 0.7);
    const trainCandles = candles.slice(0, splitIdx);
    const testCandles = candles.slice(splitIdx);

    let bestVal = -1;
    let bestWinRate = -1;
    let bestScore = -1;

    const [start, end] = optimizer.range;
    for (let val = start; val <= end; val++) {
        const rawData = optimizer.compute(candles, val);
        const formattedData = optimizer.formatData(rawData);

        const trainResult = calculateWinRate(indicatorName, trainCandles, formattedData, { ...config, interval: config.interval });
        const testResult = calculateWinRate(indicatorName, testCandles, formattedData, { ...config, interval: config.interval });

        // Use harmonic mean of train/test as score to avoid overfitting
        const trainWR = trainResult.winRate;
        const testWR = testResult.winRate;
        if (trainWR <= 0 || testWR <= 0) continue;

        const harmonicMean = 2 * (trainWR * testWR) / (trainWR + testWR);
        const gap = Math.abs(trainWR - testWR);
        const maxWR = Math.max(trainWR, testWR);
        const overfitPenalty = maxWR > 0 ? gap / maxWR : 1;
        const score = harmonicMean * (1 - overfitPenalty * 0.5);

        if (score > bestScore) {
            bestScore = score;
            bestWinRate = testResult.winRate; // Report out-of-sample WR
            bestVal = val;
        }
    }

    // ── Fallback: if train/test split produced no valid parameter (e.g.
    //     insufficient data in either split), evaluate on the full dataset.
    if (bestScore === -1) {
        for (let val = start; val <= end; val++) {
            const rawData = optimizer.compute(candles, val);
            const formattedData = optimizer.formatData(rawData);
            const result = calculateWinRate(indicatorName, candles, formattedData, { ...config, interval: config.interval });
            if (result.winRate > bestWinRate) {
                bestWinRate = result.winRate;
                bestVal = val;
            }
        }
    }

    return { bestVal, bestWinRate };
}
