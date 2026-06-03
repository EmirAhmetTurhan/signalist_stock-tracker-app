"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
    data: LinePoint[];
    height?: number;
};

const LightweightDIChart = ({ data, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        const zeroLine = chart.addLineSeries({
            color: "#666",
            lineWidth: 1,
            lineStyle: 2, // Kesikli
            priceLineVisible: false,
        });
        if (data.length > 0) {
            zeroLine.setData(data.map(d => ({ time: d.time, value: 0 })));
        }

        chart.addLineSeries({
            color: "#FF9800",
            lineWidth: 2,
            priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        }).setData(data);
    }, [data]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightDIChart;
