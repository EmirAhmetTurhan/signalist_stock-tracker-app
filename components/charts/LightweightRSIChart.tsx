"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
    rsi: LinePoint[];
    ma: LinePoint[];
    height?: number;
};

const LightweightRSIChart = ({ rsi, ma, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        const refData = rsi.length > 0 ? rsi : ma;

        const level70 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
        level70.setData(refData.map(p => ({ time: p.time, value: 70 })));

        const level30 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
        level30.setData(refData.map(p => ({ time: p.time, value: 30 })));

        chart.addLineSeries({ color: "#7E57C2", lineWidth: 2 }).setData(rsi);
        chart.addLineSeries({ color: "#FBC02D", lineWidth: 2 }).setData(ma);
    }, [rsi, ma]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightRSIChart;
