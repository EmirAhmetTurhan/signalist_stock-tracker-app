"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };
type HistoPoint = { time: UTCTimestamp; value: number; color?: string };

type Props = {
    smi: LinePoint[];
    signal: LinePoint[];
    histogram: HistoPoint[];
    height?: number;
};

const LightweightSMIChart = ({ smi, signal, histogram, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        // Histogram (Arkada kalsın diye önce ekliyoruz)
        const histSeries = chart.addHistogramSeries({
            base: 0,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
            color: '#888888', // Varsayılan renk, veriden gelen 'color' override edecek
        });
        histSeries.setData(histogram);

        // SMI Çizgisi (Ana Çizgi - Genelde Mavi/Mor)
        chart.addLineSeries({ color: "#2962FF", lineWidth: 2 }).setData(smi);

        // Sinyal Çizgisi (Genelde Turuncu/Kırmızı)
        chart.addLineSeries({ color: "#FF6D00", lineWidth: 2 }).setData(signal);

        // Sıfır Çizgisi (Referans)
        const zeroLine = chart.addLineSeries({
            color: "#555",
            lineWidth: 1,
            lineStyle: 2 // Kesikli çizgi
        });
        // Sadece görsel referans için veri aralığı boyunca 0 basıyoruz
        if (smi.length > 0) {
            zeroLine.setData(smi.map(p => ({ time: p.time, value: 0 })));
        }
    }, [smi, signal]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightSMIChart;
