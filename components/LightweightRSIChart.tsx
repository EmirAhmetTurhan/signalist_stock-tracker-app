"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: number; value: number };

type Props = {
    rsi: LinePoint[];
    ma: LinePoint[];
    height?: number;
};

const LightweightRSIChart = ({ rsi, ma, height = 240 }: Props) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let chart: any | undefined;
        let rsiSeries: any | undefined;
        let maSeries: any | undefined;
        let level70: any | undefined;
        let level30: any | undefined;
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

            const refData = rsi.length > 0 ? rsi : ma;

            level70 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
            level70.setData(refData.map(p => ({ time: p.time, value: 70 })));

            level30 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 });
            level30.setData(refData.map(p => ({ time: p.time, value: 30 })));

            rsiSeries = chart.addLineSeries({ color: "#7E57C2", lineWidth: 2 });
            rsiSeries.setData(rsi);

            maSeries = chart.addLineSeries({ color: "#FBC02D", lineWidth: 2 });
            maSeries.setData(ma);

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
    }, [JSON.stringify({ rsi, ma }), height]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightRSIChart;