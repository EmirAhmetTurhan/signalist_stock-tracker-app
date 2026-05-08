import { computeRSI } from "./indicators/rsi";
import { computeMACD } from "./indicators/macd";
import { computeMFI } from "./indicators/mfi";
import { computeCCI } from "./indicators/cci";
import { computeWPR } from "./indicators/wpr";
import { computeStochRSI } from "./indicators/stochrsi";
import { computeWaveTrend } from "./indicators/wavetrend";
import { computeDMI } from "./indicators/dmi";
import { computeSMI } from "./indicators/smi";
import { computeDemandIndex } from "./indicators/demand_index";
import { computeCMF } from "./indicators/cmf";
import { computeMADR } from "./indicators/madr";
import { calculateWinRate, Candle } from "./backtest-utils";

export const OPTIMIZABLE_INDICATORS: Record<string, any> = {
    "RSI": {
        param: "rsi_len",
        range: [2, 40],
        compute: (candles: Candle[], val: number) => computeRSI(candles as any, val, 14),
        formatData: (res: any[]) => ({
            rsi: res.filter(p => typeof p.rsi === 'number').map(p => ({ time: p.time, value: p.rsi })),
            ma: res.filter(p => typeof p.ma === 'number').map(p => ({ time: p.time, value: p.ma }))
        })
    },
    "MACD": {
        param: "macd_fast",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeMACD(candles as any, val, 26, 9),
        formatData: (res: any[]) => ({
            macd: res.filter(p => typeof p.macd === 'number').map(p => ({ time: p.time, value: p.macd })),
            signal: res.filter(p => typeof p.signal === 'number').map(p => ({ time: p.time, value: p.signal })),
            histogram: res.filter(p => typeof p.histogram === 'number').map(p => ({ time: p.time, value: p.histogram }))
        })
    },
    "STOCHRSI": {
        param: "stoch_rsi_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeStochRSI(candles as any, val, 14, 3, 3),
        formatData: (res: any[]) => ({
            k: res.filter(p => typeof p.k === 'number').map(p => ({ time: p.time, value: p.k })),
            d: res.filter(p => typeof p.d === 'number').map(p => ({ time: p.time, value: p.d }))
        })
    },
    "WAVETREND": {
        param: "wt_avg_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeWaveTrend(candles as any, val, 21, 4),
        formatData: (res: any[]) => ({
            wt1: res.filter(p => typeof p.wt1 === 'number').map(p => ({ time: p.time, value: p.wt1 })),
            wt2: res.filter(p => typeof p.wt2 === 'number').map(p => ({ time: p.time, value: p.wt2 }))
        })
    },
    "DMI": {
        param: "dmi_di_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeDMI(candles as any, val, 14),
        formatData: (res: any[]) => ({
            plusDI: res.filter(p => typeof p.plusDI === 'number').map(p => ({ time: p.time, value: p.plusDI })),
            minusDI: res.filter(p => typeof p.minusDI === 'number').map(p => ({ time: p.time, value: p.minusDI })),
            adx: res.filter(p => typeof p.adx === 'number').map(p => ({ time: p.time, value: p.adx }))
        })
    },
    "MFI": {
        param: "mfi_period",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeMFI(candles as any, val),
        formatData: (res: any[]) => ({
            mfi: res.filter(p => typeof p.mfi === 'number').map(p => ({ time: p.time, value: p.mfi }))
        })
    },
    "SMI": {
        param: "smi_long_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeSMI(candles as any, val, 5, 5),
        formatData: (res: any[]) => ({
            smi: res.filter(p => typeof p.smi === 'number').map(p => ({ time: p.time, value: p.smi })),
            signal: res.filter(p => typeof p.signal === 'number').map(p => ({ time: p.time, value: p.signal }))
        })
    },
    "CCI": {
        param: "cci_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeCCI(candles as any, val, 14),
        formatData: (res: any[]) => ({
            cci: res.filter(p => typeof p.cci === 'number').map(p => ({ time: p.time, value: p.cci })),
            ma: res.filter(p => typeof p.ma === 'number').map(p => ({ time: p.time, value: p.ma }))
        })
    },
    "WPR": {
        param: "wpr_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeWPR(candles as any, val),
        formatData: (res: any[]) => res.map(p => ({ time: p.time, value: p.value }))
    },
    "DI": {
        param: "di_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeDemandIndex(candles as any, val, 10, 2),
        formatData: (res: any[]) => res.map(p => ({ time: p.time, value: p.value }))
    },
    "CMF": {
        param: "cmf_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeCMF(candles as any, val),
        formatData: (res: any[]) => res.map(p => ({ time: p.time, value: p.value }))
    },
    "MADR": {
        param: "madr_len",
        range: [5, 40],
        compute: (candles: Candle[], val: number) => computeMADR(candles as any, val),
        formatData: (res: any[]) => res.map(p => ({ time: p.time, value: p.value }))
    }
}

export function findBestParameter(
    indicatorName: string,
    candles: Candle[],
    config: { lookForward: number } = { lookForward: 5 }
) {
    const optimizer = OPTIMIZABLE_INDICATORS[indicatorName];
    if (!optimizer) return null;

    let bestVal = -1;
    let bestWinRate = -1;

    const [start, end] = optimizer.range;
    for (let val = start; val <= end; val++) {
        const rawData = optimizer.compute(candles, val);
        const formattedData = optimizer.formatData(rawData);
        const { winRate } = calculateWinRate(indicatorName, candles, formattedData, config);

        if (winRate > bestWinRate) {
            bestWinRate = winRate;
            bestVal = val;
        }
    }

    return { bestVal, bestWinRate };
}
