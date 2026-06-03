"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type AOPoint = { time: UTCTimestamp; value: number; color?: string };

type Props = {
    data: AOPoint[];
    height?: number;
};

const LightweightAOChart = ({ data, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        chart.addHistogramSeries({
            priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        }).setData(data);
    }, [data]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightAOChart;