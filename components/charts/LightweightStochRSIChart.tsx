"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
  k: LinePoint[]; // %K
  d: LinePoint[]; // %D
  height?: number;
};

const LightweightStochRSIChart = ({ k, d, height = 240 }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: any | undefined;
    let kSeries: any | undefined;
    let dSeries: any | undefined;
    let level20: any | undefined;
    let level80: any | undefined;
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

      // Horizontal levels at 20 and 80
      level20 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
      level20.setData((k.length > 0 ? k : d).map((p) => ({ time: p.time, value: 20 })));
      level80 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
      level80.setData((k.length > 0 ? k : d).map((p) => ({ time: p.time, value: 80 })));

      kSeries = chart.addLineSeries({ color: "#0db27a", lineWidth: 2 });
      kSeries.setData(k);

      dSeries = chart.addLineSeries({ color: "#ffb703", lineWidth: 2 });
      dSeries.setData(d);

      // Note: lightweight-charts does not expose fixed bounds for price scale easily;
      // we rely on fitContent() and horizontal guides at 20/80 for context.

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
  }, [JSON.stringify({ k, d }), height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightStochRSIChart;
