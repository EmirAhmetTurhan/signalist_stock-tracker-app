"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
    cci: LinePoint[];
    ma: LinePoint[];
    height?: number;
};

const LightweightCCIChart = ({ cci, ma, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        const refData = cci.length > 0 ? cci : ma;

        const level100 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 }); // Kesikli
        level100.setData(refData.map(p => ({ time: p.time, value: 100 })));

        const levelNeg100 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 }); // Kesikli
        levelNeg100.setData(refData.map(p => ({ time: p.time, value: -100 })));

        // CCI Ana Çizgi (Mavi - Görseldeki gibi)
        chart.addLineSeries({ color: "#2962FF", lineWidth: 2 }).setData(cci);

        // CCI Hareketli Ortalama (Sarı - Görseldeki gibi)
        chart.addLineSeries({ color: "#FFD600", lineWidth: 2 }).setData(ma);
    }, [cci, ma]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightCCIChart;
