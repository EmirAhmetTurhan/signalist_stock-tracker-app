"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
    data: LinePoint[];
    height?: number;
};

const LightweightADChart = ({ data, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        chart.addLineSeries({ color: "#FFA726", lineWidth: 2 }).setData(data);
    }, [data]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightADChart;