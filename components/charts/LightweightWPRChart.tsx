"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
    data: LinePoint[];
    height?: number;
};

const LightweightWPRChart = ({ data, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 })
            .setData(data.map(p => ({ time: p.time, value: -20 })));
        chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 })
            .setData(data.map(p => ({ time: p.time, value: -80 })));
        chart.addLineSeries({ color: "#7E57C2", lineWidth: 2 }).setData(data);
    }, [data]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightWPRChart;