"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: number; value: number };

type Props = {
    data: LinePoint[];
    height?: number;
};

const LightweightWPRChart = ({ data, height = 240 }: Props) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let chart: any | undefined;
        let wprSeries: any | undefined;
        let levelOverbought: any | undefined;
        let levelOversold: any | undefined;
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

            levelOverbought = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
            levelOverbought.setData(data.map(p => ({ time: p.time, value: -20 })));

            levelOversold = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
            levelOversold.setData(data.map(p => ({ time: p.time, value: -80 })));

            wprSeries = chart.addLineSeries({ color: "#7E57C2", lineWidth: 2 });
            wprSeries.setData(data);

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
    }, [JSON.stringify(data), height]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightWPRChart;