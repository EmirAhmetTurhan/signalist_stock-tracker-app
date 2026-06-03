"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp, SeriesMarkerPosition } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };
type Marker = { time: UTCTimestamp; cross: 1 | -1 };

type Props = {
  wt1: LinePoint[];
  wt2: LinePoint[];
  crosses?: Marker[];
  height?: number;
};

const LightweightWaveTrendChart = ({ wt1, wt2, crosses = [], height = 240 }: Props) => {
  const { containerRef } = useLightweightChart(height, (chart) => {
    const level60 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
    level60.setData((wt1.length > 0 ? wt1 : wt2).map((p) => ({ time: p.time as UTCTimestamp, value: 60 })));
    const levelNeg60 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
    levelNeg60.setData((wt1.length > 0 ? wt1 : wt2).map((p) => ({ time: p.time as UTCTimestamp, value: -60 })));

    const wt1Series = chart.addLineSeries({ color: "#0db27a", lineWidth: 2 });
    wt1Series.setData(wt1);

    chart.addLineSeries({ color: "#ffb703", lineWidth: 2 }).setData(wt2);

    // Mark crosses on wt1 line
    try {
      const markers = crosses.map((m) => ({
        time: m.time as UTCTimestamp,
        position: "inBar" as SeriesMarkerPosition,
        color: m.cross === 1 ? "#16a34a" : "#ef4444",
        shape: (m.cross === 1 ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
        text: m.cross === 1 ? "WT ⤴" : "WT ⤵",
      }));
      // @ts-ignore - markers API exists at runtime
      wt1Series.setMarkers?.(markers);
    } catch { }
  }, [wt1, wt2, crosses]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightWaveTrendChart;
