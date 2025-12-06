"use client";

import { useEffect, useRef } from "react";

type LinePoint = { time: number; value: number };

type Props = {
    cci: LinePoint[];
    ma: LinePoint[];
    height?: number;
};

const LightweightCCIChart = ({ cci, ma, height = 240 }: Props) => {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let chart: any | undefined;
        let cciSeries: any | undefined;
        let maSeries: any | undefined;
        let level100: any | undefined;
        let levelNeg100: any | undefined;
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

            const refData = cci.length > 0 ? cci : ma;

            level100 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 }); // Kesikli
            level100.setData(refData.map(p => ({ time: p.time, value: 100 })));

            levelNeg100 = chart.addLineSeries({ color: "#666", lineWidth: 1, lineStyle: 2 }); // Kesikli
            levelNeg100.setData(refData.map(p => ({ time: p.time, value: -100 })));

            // CCI Ana Çizgi (Mavi - Görseldeki gibi)
            cciSeries = chart.addLineSeries({ color: "#2962FF", lineWidth: 2 });
            cciSeries.setData(cci);

            // CCI Hareketli Ortalama (Sarı - Görseldeki gibi)
            maSeries = chart.addLineSeries({ color: "#FFD600", lineWidth: 2 });
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
    }, [JSON.stringify({ cci, ma }), height]);

    return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightCCIChart;