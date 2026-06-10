"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
    ad: LinePoint[];
    ma: LinePoint[];
    height?: number;
};

const LightweightADChart = ({ ad, ma, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        chart.addLineSeries({ color: "#FFA726", lineWidth: 2, title: "A/D" }).setData(ad);
        chart.addLineSeries({ color: "#29B6F6", lineWidth: 1, lineStyle: 2, title: "A/D MA" }).setData(ma.filter(p => p.value !== undefined) as LinePoint[]);
    }, [ad, ma]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightADChart;