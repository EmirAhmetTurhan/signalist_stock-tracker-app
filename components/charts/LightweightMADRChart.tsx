"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
    data: LinePoint[];
    height?: number;
};

const LightweightMADRChart = ({ data, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        chart.addBaselineSeries({
            baseValue: { type: 'price', price: 0 },
            topLineColor: '#0db27a', // Yeşil Çizgi
            topFillColor1: 'rgba(13, 178, 122, 0.28)', // Yeşil Dolgu (Koyu)
            topFillColor2: 'rgba(13, 178, 122, 0.05)', // Yeşil Dolgu (Açık)
            bottomLineColor: '#ef4444', // Kırmızı Çizgi
            bottomFillColor1: 'rgba(239, 68, 68, 0.05)', // Kırmızı Dolgu (Açık)
            bottomFillColor2: 'rgba(239, 68, 68, 0.28)', // Kırmızı Dolgu (Koyu)
        }).setData(data);
    }, [data]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightMADRChart;
