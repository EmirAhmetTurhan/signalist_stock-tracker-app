"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
  mfi: LinePoint[];
  height?: number;
};

const LightweightMFIChart = ({ mfi, height = 240 }: Props) => {
  const { containerRef } = useLightweightChart(height, (chart) => {
    const refData = mfi;
    chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 })
      .setData(refData.map((p) => ({ time: p.time as UTCTimestamp, value: 20 })));
    chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 })
      .setData(refData.map((p) => ({ time: p.time as UTCTimestamp, value: 80 })));
    chart.addLineSeries({ color: "#4f46e5", lineWidth: 2 }).setData(mfi);
  }, [mfi]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightMFIChart;
