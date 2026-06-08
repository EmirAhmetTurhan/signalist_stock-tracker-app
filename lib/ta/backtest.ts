export type Candle = { time: string | number; close: number; high: number; low: number; open?: number; volume?: number };

export type BacktestHistoryItem = {
    time: string | number;
    signal: "BUY" | "SELL";
    price: number;
    futurePrice: number;
    isWin: boolean;
    // ─── Path-Aware Fields (populated when evaluationMode != 'lookforward') ───
    /** Maximum Favorable Excursion — best unrealized P&L during the trade (%) */
    mfe?: number;
    /** Maximum Adverse Excursion — worst unrealized P&L during the trade (%) */
    mae?: number;
    /** Intra-trade max drawdown from peak unrealized P&L (%) */
    intraTradeDD?: number;
    /** Exit reason: stop_loss | take_profit | trailing_stop | opposite_signal | time_stop */
    exitReason?: string;
    /** Number of bars the position was held */
    barsHeld?: number;
    /** Realized return percentage after path-aware simulation */
    realizedReturn?: number;
};

import {
    macdSignal, rsiSignal, stochRsiSignal, waveTrendSignal,
    dmiSignal, mfiSignal, smiSignal, aoSignal, cciSignal,
    wprSignal, diSignal, cmfSignal, adSignal, netvolSignal,
    madrSignal, almaSignal, bbSignal,
} from './signal-registry';
import type { SignalDir } from './signal-registry';
import { assertAllowedTimeframe } from './timeframe-guard';

export function calculateSMA(data: number[], window: number) {
    if (data.length < window) return null;
    let sum = 0;
    for (let i = 0; i < window; i++) sum += data[data.length - 1 - i];
    return sum / window;
}

export function calculateWinRate(
    indicatorName: string,
    candles: Candle[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    config: { lookForward: number; interval?: string } = { lookForward: 5 }
) {
    if (!candles || candles.length === 0 || !data) return { winRate: 0, totalSignals: 0, wins: 0, history: [] as BacktestHistoryItem[] };

    let wins = 0;
    let totalSignals = 0;
    const history: BacktestHistoryItem[] = [];
    const { lookForward } = config;

    // ── Timeframe Isolation Guard ──────────────────────────────────
    const effectiveInterval = assertAllowedTimeframe(config.interval || '1d', 'backtest.calculateWinRate');

    // Dynamic warmup based on data size and interval
    // Short datasets need smaller warmup to not starve the backtest
    const warmupMap: Record<string, number> = {
        '1d': Math.min(20, Math.floor(candles.length * 0.05)),
        '4h': Math.min(30, Math.floor(candles.length * 0.05)),
    };
    const startIndex = warmupMap[effectiveInterval] ?? Math.min(20, Math.floor(candles.length * 0.05));
    const endIndex = candles.length - lookForward;

    // Signal resolver map — one entry per indicator, no if/else chain.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type ResolverFn = (d: any, i: number, c: Candle[]) => SignalDir;
    const signalResolvers: Record<string, ResolverFn> = {
        MACD: (d, i) => {
            const macd = d.macd[i]?.value, sig = d.signal[i]?.value;
            return macd !== undefined && sig !== undefined ? macdSignal(macd, sig) : null;
        },
        RSI: (d, i) => {
            const rsi = d.rsi[i]?.value, ma = d.ma[i]?.value;
            return rsi !== undefined && ma !== undefined ? rsiSignal(rsi, ma) : null;
        },
        STOCHRSI: (d, i) => {
            const k = d.k[i]?.value, dd = d.d[i]?.value;
            return k !== undefined && dd !== undefined ? stochRsiSignal(k, dd) : null;
        },
        WAVETREND: (d, i) => {
            const wt1 = d.wt1[i]?.value, wt2 = d.wt2[i]?.value;
            return wt1 !== undefined && wt2 !== undefined ? waveTrendSignal(wt1, wt2) : null;
        },
        DMI: (d, i) => {
            const plus = d.plusDI[i]?.value, minus = d.minusDI[i]?.value;
            return plus !== undefined && minus !== undefined ? dmiSignal(plus, minus) : null;
        },
        MFI: (d, i) => {
            const cur = d.mfi[i]?.value, prev = d.mfi[i - 1]?.value;
            return cur !== undefined && prev !== undefined ? mfiSignal(cur, prev) : null;
        },
        SMI: (d, i) => {
            const smi = d.smi[i]?.value, sig = d.signal[i]?.value;
            return smi !== undefined && sig !== undefined ? smiSignal(smi, sig) : null;
        },
        AO: (d, i) => {
            const cur = d[i]?.value, prev = d[i - 1]?.value;
            return cur !== undefined && prev !== undefined ? aoSignal(cur, prev) : null;
        },
        CCI: (d, i) => {
            const cci = d.cci[i]?.value, ma = d.ma[i]?.value;
            return cci !== undefined && ma !== undefined ? cciSignal(cci, ma) : null;
        },
        WPR: (d, i) => {
            const cur = d[i]?.value, prev = d[i - 1]?.value;
            return cur !== undefined && prev !== undefined ? wprSignal(cur, prev) : null;
        },
        DI: (d, i) => {
            const cur = d[i]?.value;
            return cur !== undefined ? diSignal(cur) : null;
        },
        CMF: (d, i) => {
            const val = d[i]?.value;
            return val !== undefined ? cmfSignal(val) : null;
        },
        AD: (d, i) => {
            const values: number[] = [];
            for (let k = 0; k < 22; k++) if (d[i - k]) values.push(d[i - k].value);
            if (values.length < 22) return null;
            const cur = values[0];
            let sum = 0; for (let s = 1; s <= 21; s++) sum += values[s];
            return adSignal(cur, sum / 21);
        },
        NETVOL: (d, i) => {
            const cur = d[i]?.value;
            return cur !== undefined ? netvolSignal(cur) : null;
        },
        MADR: (d, i) => {
            const cur = d[i]?.value;
            return cur !== undefined ? madrSignal(cur) : null;
        },
        ALMA: (d, i, c) => {
            const curA = d[i]?.value, prevA = d[i - 1]?.value;
            if (curA === undefined || prevA === undefined) return null;
            return almaSignal(curA, prevA, c[i].close, c[i - 1].close);
        },
        BOLLINGER: (d, i, c) => {
            const curBB = d[i], prevBB = d[i - 1];
            if (!curBB || !prevBB || curBB.lower === undefined || curBB.upper === undefined) return null;
            return bbSignal(curBB, prevBB, c[i].close, c[i - 1].close);
        },
    };

    const resolver = signalResolvers[indicatorName];
    if (!resolver) return { winRate: 0, totalSignals: 0, wins: 0, history: [] };

    for (let i = startIndex; i < endIndex; i++) {
        const currentPrice = candles[i].close;
        const futurePrice = candles[i + lookForward].close;
        const signal = resolver(data, i, candles);

        if (signal) {
            totalSignals++;
            const isWin = (signal === "BUY" && futurePrice > currentPrice) || (signal === "SELL" && futurePrice < currentPrice);
            if (isWin) wins++;
            history.push({ time: candles[i].time, signal, price: currentPrice, futurePrice, isWin });
        }
    }

    const calculatedWinRate = totalSignals > 0 ? (wins / totalSignals) * 100 : 0;
    return { winRate: calculatedWinRate, totalSignals, wins, history };
}
