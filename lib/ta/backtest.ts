export type Candle = { time: string | number; close: number; high: number; low: number; open?: number; volume?: number };

export type BacktestHistoryItem = {
    time: string | number;
    signal: "BUY" | "SELL";
    price: number;
    futurePrice: number;
    isWin: boolean;
};

export function calculateSMA(data: number[], window: number) {
    if (data.length < window) return null;
    let sum = 0;
    for (let i = 0; i < window; i++) sum += data[data.length - 1 - i];
    return sum / window;
}

export function calculateWinRate(
    indicatorName: string,
    candles: Candle[],
    data: any,
    config: { lookForward: number } = { lookForward: 5 }
) {
    if (!candles || candles.length === 0 || !data) return { winRate: 0, totalSignals: 0, wins: 0, history: [] as BacktestHistoryItem[] };

    let wins = 0;
    let totalSignals = 0;
    const history: BacktestHistoryItem[] = [];
    const { lookForward } = config;

    const startIndex = 50;
    const endIndex = candles.length - lookForward;

    for (let i = startIndex; i < endIndex; i++) {
        const currentPrice = candles[i].close;
        const futurePrice = candles[i + lookForward].close;

        let signal: "BUY" | "SELL" | null = null;

        // --- 1. MACD ---
        if (indicatorName === "MACD" && data.macd && data.signal) {
            const macd = data.macd[i]?.value;
            const sig = data.signal[i]?.value;
            if (macd > sig) signal = "BUY";
            else if (macd < sig) signal = "SELL";
        }

        // --- 2. RSI ---
        else if (indicatorName === "RSI" && data.rsi && data.ma) {
            const rsi = data.rsi[i]?.value;
            const ma = data.ma[i]?.value;
            if (rsi > ma) signal = "BUY";
            else signal = "SELL";
        }

        // --- 3. STOCH RSI ---
        else if (indicatorName === "STOCHRSI" && data.k && data.d) {
            const k = data.k[i]?.value;
            const d = data.d[i]?.value;
            if (k > d) signal = "BUY";
            else if (k < d) signal = "SELL";
        }

        // --- 4. WAVE TREND ---
        else if (indicatorName === "WAVETREND" && data.wt1 && data.wt2) {
            const wt1 = data.wt1[i]?.value;
            const wt2 = data.wt2[i]?.value;
            if (wt1 > wt2) signal = "BUY";
            else if (wt1 < wt2) signal = "SELL";
        }

        // --- 5. DMI ---
        else if (indicatorName === "DMI" && data.plusDI && data.minusDI) {
            const plus = data.plusDI[i]?.value;
            const minus = data.minusDI[i]?.value;
            if (plus > minus) signal = "BUY";
            else if (minus > plus) signal = "SELL";
        }

        // --- 6. MFI ---
        else if (indicatorName === "MFI" && data.mfi) {
            const last = data.mfi[i]?.value;
            const prev = data.mfi[i - 1]?.value;
            if (last < 20) signal = "BUY";
            else if (last > 80) signal = "SELL";
            else if (last > prev) signal = "BUY";
            else if (last < prev) signal = "SELL";
        }

        // --- 7. SMI ---
        else if (indicatorName === "SMI" && data.smi && data.signal) {
            const smi = data.smi[i]?.value;
            const sig = data.signal[i]?.value;
            if (smi > sig) signal = "BUY";
            else if (smi < sig) signal = "SELL";
        }

        // --- 8. AO ---
        else if (indicatorName === "AO" && data[i]) {
            const curr = data[i]?.value;
            const prev = data[i - 1]?.value;
            const rising = curr > prev;
            if (curr > 0) {
                signal = rising ? "BUY" : "SELL";
            } else {
                signal = !rising ? "SELL" : "BUY";
            }
        }

        // --- 9. CCI ---
        else if (indicatorName === "CCI" && data.cci && data.ma) {
            const cci = data.cci[i]?.value;
            const ma = data.ma[i]?.value;
            if (cci > ma) signal = "BUY";
            else signal = "SELL";
        }

        // --- 10. WPR ---
        else if (indicatorName === "WPR" && data[i]) {
            const cur = data[i]?.value;
            const prev = data[i - 1]?.value;
            if (cur < -80) signal = "BUY";
            else if (cur > -20) signal = "SELL";
            else signal = cur > prev ? "BUY" : "SELL";
        }

        // --- 11. DI ---
        else if (indicatorName === "DI" && data[i]) {
            const cur = data[i]?.value;
            const prev = data[i - 1]?.value;
            if (cur > 0) signal = "BUY";
            else signal = "SELL";
        }

        // --- 12. CMF ---
        else if (indicatorName === "CMF" && data[i]) {
            const val = data[i]?.value;
            if (val > 0) signal = "BUY";
            else signal = "SELL";
        }

        // --- 13. AD ---
        else if (indicatorName === "AD" && data[i]) {
            const values: number[] = [];
            for (let k = 0; k < 22; k++) {
                if (data[i - k]) values.push(data[i - k].value);
            }
            if (values.length >= 22) {
                const cur = values[0];
                // SMA yalnızca geçmiş 21 değerden (values[1]..values[21]), mevcut gün hariç
                let sum = 0; for (let s = 1; s <= 21; s++) sum += values[s];
                const curSMA = sum / 21;
                if (cur > curSMA) signal = "BUY";
                else signal = "SELL";
            }
        }

        // --- 14. Net Volume ---
        else if (indicatorName === "NETVOL" && data[i]) {
            const cur = data[i]?.value;
            const prev = data[i - 1]?.value;
            if (cur > 0) signal = "BUY";
            else if (cur < 0) signal = "SELL";
        }

        // --- 15. MADR ---
        else if (indicatorName === "MADR" && data[i]) {
            const cur = data[i]?.value;
            if (cur > 0) signal = "BUY";
            else signal = "SELL";
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
