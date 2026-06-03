"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
  plusDI: LinePoint[];
  minusDI: LinePoint[];
  adx: LinePoint[];
  height?: number;
};

const LightweightDMIChart = ({ plusDI, minusDI, adx, height = 240 }: Props) => {
  const { containerRef } = useLightweightChart(height, (chart) => {
    // Horizontal guide levels
    const refData = plusDI.length > 0 ? plusDI : (minusDI.length > 0 ? minusDI : adx);
    const level20 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
    level20.setData(refData.map((p) => ({ time: p.time as UTCTimestamp, value: 20 })));
    const level25 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
    level25.setData(refData.map((p) => ({ time: p.time as UTCTimestamp, value: 25 })));

    chart.addLineSeries({ color: "#0db27a", lineWidth: 2 }).setData(plusDI);
    chart.addLineSeries({ color: "#ef4444", lineWidth: 2 }).setData(minusDI);
    chart.addLineSeries({ color: "#ffb703", lineWidth: 2 }).setData(adx);
  }, [plusDI, minusDI, adx]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightDMIChart;
