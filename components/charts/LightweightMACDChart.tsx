"use client";

import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp } from "lightweight-charts";

type LinePoint = { time: UTCTimestamp; value: number };
type HistoPoint = { time: UTCTimestamp; value: number; color?: string };

type Props = {
  macd: LinePoint[];
  signal: LinePoint[];
  histogram: HistoPoint[];
  height?: number;
};

const LightweightMACDChart = ({ macd, signal, histogram, height = 240 }: Props) => {
  const { containerRef } = useLightweightChart(height, (chart) => {
    const histSeries = chart.addHistogramSeries({
      base: 0,
      priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
      color: '#888888',
    });
    histSeries.setData(histogram);

    chart.addLineSeries({ color: "#0db27a", lineWidth: 2 }).setData(macd);
    chart.addLineSeries({ color: "#ffb703", lineWidth: 2 }).setData(signal);
  }, [macd, signal, histogram]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightMACDChart;
