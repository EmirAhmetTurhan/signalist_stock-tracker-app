"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Candle = { time: string | number; close: number; high: number; low: number };
type IndicatorData = any;

interface BacktestMonitorProps {
    indicatorName: string;
    candles: Candle[];
    data: IndicatorData;
    config?: {
        lookForward: number; // Kaç gün sonrasını test ediyoruz?
    };
}

// YARDIMCI: Hareketli Ortalama Hesabı (AD indikatörü için gerekli)
const calculateSMA = (data: number[], window: number) => {
    if (data.length < window) return null;
    let sum = 0;
    for(let i=0; i<window; i++) sum += data[data.length - 1 - i];
    return sum / window;
};

export default function BacktestMonitor({
                                            indicatorName,
                                            candles,
                                            data,
                                            config = { lookForward: 5 },
                                        }: BacktestMonitorProps) {
    const [stats, setStats] = useState({ winRate: 0, totalSignals: 0, wins: 0 });
    const [animatedPercent, setAnimatedPercent] = useState(0);

    useEffect(() => {
        if (!candles || candles.length === 0 || !data) return;

        let wins = 0;
        let totalSignals = 0;
        const { lookForward } = config;

        // Verilerin oturması için güvenli başlangıç
        const startIndex = 50;
        const endIndex = candles.length - lookForward;

        for (let i = startIndex; i < endIndex; i++) {
            const currentPrice = candles[i].close;
            const futurePrice = candles[i + lookForward].close;

            let signal: "BUY" | "SELL" | null = null;

            // ======================================================
            // SENİN PAGE.TSX DOSYANDAKİ MANTIKLARIN BİREBİR AYNISI
            // ======================================================

            // --- 1. MACD ---
            if (indicatorName === "MACD" && data.macd && data.signal) {
                const macd = data.macd[i]?.value;
                const sig = data.signal[i]?.value;
                // Logic: Macd > Signal ise (Strong Buy veya Weak Buy fark etmez) -> BUY
                if (macd > sig) signal = "BUY";
                else if (macd < sig) signal = "SELL";
            }

            // --- 2. RSI ---
            else if (indicatorName === "RSI" && data.rsi && data.ma) {
                const rsi = data.rsi[i]?.value;
                const ma = data.ma[i]?.value;
                // Logic: RSI > MA ise (Strong Buy veya Weak Buy) -> BUY
                if (rsi > ma) signal = "BUY";
                else signal = "SELL";
            }

            // --- 3. STOCH RSI ---
            else if (indicatorName === "STOCHRSI" && data.k && data.d) {
                const k = data.k[i]?.value;
                const d = data.d[i]?.value;
                // Logic: K > D ise (Strong Buy veya Weak Buy) -> BUY
                if (k > d) signal = "BUY";
                else if (k < d) signal = "SELL";
            }

            // --- 4. WAVE TREND ---
            else if (indicatorName === "WAVETREND" && data.wt1 && data.wt2) {
                const wt1 = data.wt1[i]?.value;
                const wt2 = data.wt2[i]?.value;
                // Logic: WT1 > WT2 ise -> BUY
                if (wt1 > wt2) signal = "BUY";
                else if (wt1 < wt2) signal = "SELL";
            }

            // --- 5. DMI ---
            else if (indicatorName === "DMI" && data.plusDI && data.minusDI) {
                const plus = data.plusDI[i]?.value;
                const minus = data.minusDI[i]?.value;
                // Logic: +DI > -DI ise -> BUY
                if (plus > minus) signal = "BUY";
                else if (minus > plus) signal = "SELL";
            }

            // --- 6. MFI (Karmaşık Mantık) ---
            else if (indicatorName === "MFI" && data.mfi) {
                const last = data.mfi[i]?.value;
                const prev = data.mfi[i-1]?.value;

                // Senin Sıralaman:
                // 1. last < 20 -> STRONG BUY
                // 2. last > 80 -> STRONG SELL
                // 3. last > prev -> WEAK BUY
                // 4. last < prev -> WEAK SELL

                if (last < 20) signal = "BUY";
                else if (last > 80) signal = "SELL";
                else if (last > prev) signal = "BUY";
                else if (last < prev) signal = "SELL";
            }

            // --- 7. SMI ---
            else if (indicatorName === "SMI" && data.smi && data.signal) {
                const smi = data.smi[i]?.value;
                const sig = data.signal[i]?.value;
                // Logic: SMI > Signal ise -> BUY
                if (smi > sig) signal = "BUY";
                else if (smi < sig) signal = "SELL";
            }

            // --- 8. AO (Awesome Oscillator) ---
            else if (indicatorName === "AO" && data[i]) {
                const curr = data[i]?.value;
                const prev = data[i-1]?.value;
                const rising = curr > prev;

                // Senin Logic:
                // curr > 0 -> (rising ? STRONG BUY : WEAK SELL)
                // else     -> (!rising ? STRONG SELL : WEAK BUY)

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
                // Logic: CCI > MA ise (Strong/Weak) -> BUY
                if (cci > ma) signal = "BUY";
                else signal = "SELL";
            }

            // --- 10. WPR (Williams %R) ---
            else if (indicatorName === "WPR" && data[i]) {
                const cur = data[i]?.value;
                const prev = data[i-1]?.value;

                // Senin Logic:
                // cur < -80 -> STRONG BUY
                // cur > -20 -> STRONG SELL
                // else -> (cur > prev ? WEAK BUY : WEAK SELL)

                if (cur < -80) signal = "BUY";
                else if (cur > -20) signal = "SELL";
                else signal = cur > prev ? "BUY" : "SELL";
            }

            // --- 11. DI (Demand Index) ---
            else if (indicatorName === "DI" && data[i]) {
                const cur = data[i]?.value;
                const prev = data[i-1]?.value;

                // Senin Logic:
                // cur > 0 -> (cur > prev ? STRONG BUY : WEAK BUY) -> Her türlü BUY
                // else    -> (cur < prev ? STRONG SELL : WEAK SELL) -> Her türlü SELL

                if (cur > 0) signal = "BUY";
                else signal = "SELL";
            }

            // --- 12. CMF ---
            else if (indicatorName === "CMF" && data[i]) {
                const val = data[i]?.value;
                // Senin Logic:
                // val > 0.05 -> STRONG BUY
                // val < -0.05 -> STRONG SELL
                // else -> (val > 0 ? WEAK BUY : WEAK SELL)

                if (val > 0) signal = "BUY"; // 0.05'ten büyükse de BUY, 0 ile 0.05 arasındaysa da BUY
                else signal = "SELL";
            }

            // --- 13. AD (Accumulation/Distribution) ---
            else if (indicatorName === "AD" && data[i]) {
                // Client side'da basit SMA hesabı yapmamız lazım veya basitleştirmemiz lazım.
                // Senin Logic: Cur > SMA(21) -> (Prev durumuna göre Strong veya Weak) ama sonuçta BUY
                const values = [];
                // Geriye dönük 22 veri lazım SMA için
                for(let k=0; k<22; k++) {
                    if (data[i-k]) values.push(data[i-k].value);
                }
                if (values.length >= 22) {
                    const cur = values[0];
                    // Basit SMA hesabı (Son 21 veri)
                    let sum = 0; for(let s=0; s<21; s++) sum += values[s];
                    const curSMA = sum / 21;

                    if (cur > curSMA) signal = "BUY";
                    else signal = "SELL";
                }
            }

            // --- 14. Net Volume ---
            else if (indicatorName === "NETVOL" && data[i]) {
                const cur = data[i]?.value;
                const prev = data[i-1]?.value;
                // Logic: cur > 0 -> BUY, cur < 0 -> SELL
                if (cur > 0) signal = "BUY"; // Rising veya Falling fark etmez, 0 üstü BUY
                else if (cur < 0) signal = "SELL";
            }

            // --- 15. MADR ---
            else if (indicatorName === "MADR" && data[i]) {
                const cur = data[i]?.value;
                // Logic: cur > 0 -> BUY (Weak veya Strong), cur < 0 -> SELL
                if (cur > 0) signal = "BUY";
                else signal = "SELL";
            }


            // ======================================================
            // SONUÇ HESAPLAMA (Short Dahil)
            // ======================================================
            if (signal) {
                totalSignals++;

                // Long İşlem Başarısı
                if (signal === "BUY" && futurePrice > currentPrice) {
                    wins++;
                }
                // Short İşlem Başarısı (Düşüşten kazanç)
                else if (signal === "SELL" && futurePrice < currentPrice) {
                    wins++;
                }
            }
        }

        const calculatedWinRate = totalSignals > 0 ? (wins / totalSignals) * 100 : 0;
        setStats({ winRate: calculatedWinRate, totalSignals: totalSignals, wins });

        const timer = setTimeout(() => {
            setAnimatedPercent(calculatedWinRate);
        }, 300);

        return () => clearTimeout(timer);
    }, [indicatorName, candles, data, config]);

    // Görsel (UI) Kısımları
    const size = 56;
    const strokeWidth = 5;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (animatedPercent / 100) * circumference;

    let colorClass = "text-gray-500";
    if (animatedPercent >= 55) colorClass = "text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]";
    else if (animatedPercent >= 45) colorClass = "text-yellow-500";
    else if (animatedPercent > 0) colorClass = "text-red-500";

    if (stats.totalSignals === 0) return null;

    return (
        <div className="flex items-center gap-3 bg-gray-900/40 border border-gray-800 rounded-lg p-2 pr-4 shadow-sm backdrop-blur-sm ml-auto">
            <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
                <svg className="w-full h-full transform -rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-gray-800" />
                    <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className={cn("transition-all duration-1000 ease-out", colorClass)} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className={cn("text-sm font-bold", colorClass)}>%{animatedPercent.toFixed(0)}</span>
                </div>
            </div>

            <div className="flex flex-col">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Backtesting</span>
                <div className="flex items-center gap-1.5 mt-0.5">
           <span className="text-[10px] text-gray-300 font-medium bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">
             {stats.totalSignals} Days
           </span>
                    <span className="text-[10px] text-gray-400">
             {stats.wins} Hit
           </span>
                </div>
            </div>
        </div>
    );
}