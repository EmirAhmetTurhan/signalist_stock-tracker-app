"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
    data: LinePoint[];
    height?: number;
};

const LightweightCMFChart = ({ data, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        const levelUp = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
        levelUp.setData(data.map(p => ({ time: p.time, value: 0.05 })));

        const levelDown = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
        levelDown.setData(data.map(p => ({ time: p.time, value: -0.05 })));

        chart.addBaselineSeries({
            baseValue: { type: 'price', price: 0 },
            topLineColor: '#0db27a', // Yeşil Çizgi
            topFillColor1: 'rgba(13, 178, 122, 0.28)', // Yeşil Dolgu
            topFillColor2: 'rgba(13, 178, 122, 0.05)',
            bottomLineColor: '#ef4444', // Kırmızı Çizgi
            bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
            bottomFillColor2: 'rgba(239, 68, 68, 0.28)', // Kırmızı Dolgu
        }).setData(data);
    }, [data]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightCMFChart;
