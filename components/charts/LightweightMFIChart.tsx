"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: UTCTimestamp; value: number };

type Props = {
  mfi: LinePoint[];
  height?: number;
};

const LightweightMFIChart = ({ mfi, height = 240 }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: any | undefined;
    let mfiSeries: any | undefined;
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
      const refData = mfi;
      level20 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
      level20.setData(refData.map((p) => ({ time: p.time, value: 20 })));
      level80 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
      level80.setData(refData.map((p) => ({ time: p.time, value: 80 })));

      mfiSeries = chart.addLineSeries({ color: "#4f46e5", lineWidth: 2 });
      mfiSeries.setData(mfi);

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
  }, [JSON.stringify({ mfi }), height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightMFIChart;
