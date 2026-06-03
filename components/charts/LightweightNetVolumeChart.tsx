"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type NVPoint = { time: UTCTimestamp; value: number };

type Props = {
    data: NVPoint[];
    height?: number;
};

const LightweightNetVolumeChart = ({ data, height = 240 }: Props) => {
    const { containerRef } = useLightweightChart(height, (chart) => {
        if (data.length > 0) {
            chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2, priceLineVisible: false })
                .setData(data.map(d => ({ time: d.time, value: 0 })));
        }
        chart.addLineSeries({
            color: "#2962FF",
            lineWidth: 2,
            priceFormat: { type: 'volume' },
        }).setData(data);
    }, [data]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightNetVolumeChart;