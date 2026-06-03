export type Candle = { time: string | number; close: number; high: number; low: number; open?: number; volume?: number };

export type BacktestHistoryItem = {
    time: string | number;
    signal: "BUY" | "SELL";
    price: number;
    futurePrice: number;
    isWin: boolean;
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

    // Dynamic warmup based on interval — longer intervals need fewer candles skipped
    const warmupMap: Record<string, number> = {
        '1d': 50,
        '4h': 50,
        '1wk': 20,
    };
    const startIndex = warmupMap[effectiveInterval] ?? 50;
    const endIndex = candles.length - lookForward;

    for (let i = startIndex; i < endIndex; i++) {
        const currentPrice = candles[i].close;
        const futurePrice = candles[i + lookForward].close;

        let signal: SignalDir = null;

        // --- 1. MACD ---
        if (indicatorName === "MACD" && data.macd && data.signal) {
            const macd = data.macd[i]?.value;
            const sig = data.signal[i]?.value;
            if (macd !== undefined && sig !== undefined) signal = macdSignal(macd, sig);
        }

        // --- 2. RSI ---
        else if (indicatorName === "RSI" && data.rsi && data.ma) {
            const rsi = data.rsi[i]?.value;
            const ma = data.ma[i]?.value;
            if (rsi !== undefined && ma !== undefined) signal = rsiSignal(rsi, ma);
        }

        // --- 3. STOCH RSI ---
        else if (indicatorName === "STOCHRSI" && data.k && data.d) {
            const k = data.k[i]?.value;
            const d = data.d[i]?.value;
            if (k !== undefined && d !== undefined) signal = stochRsiSignal(k, d);
        }

        // --- 4. WAVE TREND ---
        else if (indicatorName === "WAVETREND" && data.wt1 && data.wt2) {
            const wt1 = data.wt1[i]?.value;
            const wt2 = data.wt2[i]?.value;
            if (wt1 !== undefined && wt2 !== undefined) signal = waveTrendSignal(wt1, wt2);
        }

        // --- 5. DMI ---
        else if (indicatorName === "DMI" && data.plusDI && data.minusDI) {
            const plus = data.plusDI[i]?.value;
            const minus = data.minusDI[i]?.value;
            if (plus !== undefined && minus !== undefined) signal = dmiSignal(plus, minus);
        }

        // --- 6. MFI ---
        else if (indicatorName === "MFI" && data.mfi) {
            const cur = data.mfi[i]?.value;
            const prev = data.mfi[i - 1]?.value;
            if (cur !== undefined && prev !== undefined) signal = mfiSignal(cur, prev);
        }

        // --- 7. SMI ---
        else if (indicatorName === "SMI" && data.smi && data.signal) {
            const smi = data.smi[i]?.value;
            const sig = data.signal[i]?.value;
            if (smi !== undefined && sig !== undefined) signal = smiSignal(smi, sig);
        }

        // --- 8. AO ---
        else if (indicatorName === "AO" && data[i]) {
            const cur = data[i]?.value;
            const prev = data[i - 1]?.value;
            if (cur !== undefined && prev !== undefined) signal = aoSignal(cur, prev);
        }

        // --- 9. CCI ---
        else if (indicatorName === "CCI" && data.cci && data.ma) {
            const cci = data.cci[i]?.value;
            const ma = data.ma[i]?.value;
            if (cci !== undefined && ma !== undefined) signal = cciSignal(cci, ma);
        }

        // --- 10. WPR ---
        else if (indicatorName === "WPR" && data[i]) {
            const cur = data[i]?.value;
            const prev = data[i - 1]?.value;
            if (cur !== undefined && prev !== undefined) signal = wprSignal(cur, prev);
        }

        // --- 11. DI ---
        else if (indicatorName === "DI" && data[i]) {
            const cur = data[i]?.value;
            if (cur !== undefined) signal = diSignal(cur);
        }

        // --- 12. CMF ---
        else if (indicatorName === "CMF" && data[i]) {
            const val = data[i]?.value;
            if (val !== undefined) signal = cmfSignal(val);
        }

        // --- 13. AD ---
        else if (indicatorName === "AD" && data[i]) {
            const values: number[] = [];
            for (let k = 0; k < 22; k++) {
                if (data[i - k]) values.push(data[i - k].value);
            }
            if (values.length >= 22) {
                const cur = values[0];
                let sum = 0; for (let s = 1; s <= 21; s++) sum += values[s];
                const curSMA = sum / 21;
                signal = adSignal(cur, curSMA);
            }
        }

        // --- 14. Net Volume ---
        else if (indicatorName === "NETVOL" && data[i]) {
            const cur = data[i]?.value;
            if (cur !== undefined) signal = netvolSignal(cur);
        }

        // --- 15. MADR ---
        else if (indicatorName === "MADR" && data[i]) {
            const cur = data[i]?.value;
            if (cur !== undefined) signal = madrSignal(cur);
        }

        // --- 16. ALMA ---
        else if (indicatorName === "ALMA" && data[i]) {
            const curA = data[i]?.value;
            const prevA = data[i - 1]?.value;
            if (curA !== undefined && prevA !== undefined) {
                const curC = candles[i].close;
                const prevC = candles[i - 1].close;
                signal = almaSignal(curA, prevA, curC, prevC);
            }
        }

        // --- 17. Bollinger Bands ---
        else if (indicatorName === "BOLLINGER" && data[i]) {
            const curBB = data[i];
            const prevBB = data[i - 1];
            if (curBB && prevBB && curBB.lower !== undefined && curBB.upper !== undefined) {
                const curC = candles[i].close;
                const prevC = candles[i - 1].close;
                signal = bbSignal(curBB, prevBB, curC, prevC);
            }
        }

        if (signal) {
            totalSignals++;
            const isWin = (signal === "BUY" && futurePrice > currentPrice) || (signal === "SELL" && futurePrice < currentPrice);
            if (isWin) wins++;

            history.push({
                time: candles[i].time,
                signal,
                price: currentPrice,
                futurePrice,
                isWin
            });
        }
    }

    const calculatedWinRate = totalSignals > 0 ? (wins / totalSignals) * 100 : 0;
    return { winRate: calculatedWinRate, totalSignals, wins, history };
}
