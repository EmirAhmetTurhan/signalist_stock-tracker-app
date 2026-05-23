"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: UTCTimestamp; value: number };
type HistoPoint = { time: UTCTimestamp; value: number; color?: string };

type Props = {
  macd: LinePoint[];
  signal: LinePoint[];
  histogram: HistoPoint[];
  height?: number;
};

const LightweightMACDChart = ({ macd, signal, histogram, height = 240 }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: any | undefined;
    let macdSeries: any | undefined;
    let signalSeries: any | undefined;
    let histSeries: any | undefined;
    let ro: ResizeObserver | undefined;
    let disposed = false;

    (async () => {
      const mod = await import("lightweight-charts");
      if (disposed) return;
      const container = containerRef.current!;
      if (!container) return;

      chart = mod.createChart(container, {
        layout: {
          background: { color: "#141414" },
          textColor: "#DBDBDB",
        },
        grid: {
          vertLines: { color: "rgba(240,243,250,0.08)" },
          horzLines: { color: "rgba(240,243,250,0.08)" },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
        crosshair: { mode: mod.CrosshairMode.Normal },
        autoSize: true,
        height,
      });

      histSeries = chart.addHistogramSeries({
        base: 0,
        priceFormat: { type: 'price', precision: 4, minMove: 0.0001 },
        color: '#888888',
      });
      histSeries.setData(histogram);

      macdSeries = chart.addLineSeries({ color: "#0db27a", lineWidth: 2 });
      macdSeries.setData(macd);

      signalSeries = chart.addLineSeries({ color: "#ffb703", lineWidth: 2 });
      signalSeries.setData(signal);

      try {
        chart.timeScale().fitContent();
      } catch {}

      ro = new ResizeObserver(() => {
        try {
          chart?.applyOptions({ width: container.clientWidth, height });
        } catch {}
      });
      ro.observe(container);
    })();

    return () => {
      disposed = true;
      try { ro?.disconnect(); } catch {}
      try { chart?.remove?.(); } catch {}
    };
  }, [JSON.stringify({ macd, signal, histogram }), height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightMACDChart;
