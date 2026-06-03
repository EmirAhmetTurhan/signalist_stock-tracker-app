"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
  k: LinePoint[]; // %K
  d: LinePoint[]; // %D
  height?: number;
};

const LightweightStochRSIChart = ({ k, d, height = 240 }: Props) => {
  const { containerRef } = useLightweightChart(height, (chart) => {
    // Horizontal levels at 20 and 80
    const level20 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
    level20.setData((k.length > 0 ? k : d).map((p) => ({ time: p.time as UTCTimestamp, value: 20 })));
    const level80 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
    level80.setData((k.length > 0 ? k : d).map((p) => ({ time: p.time as UTCTimestamp, value: 80 })));

    chart.addLineSeries({ color: "#0db27a", lineWidth: 2 }).setData(k);
    chart.addLineSeries({ color: "#ffb703", lineWidth: 2 }).setData(d);
  }, [k, d]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightStochRSIChart;
