// hooks/useLightweightChart.ts — Paylaşılan lightweight-charts kurulum/kapatma mantığı
// 16 Lightweight*Chart bileşenindeki tekrar eden kodu merkezileştirir.
// Kullanım:
//   useLightweightChart(height, (chart, mod) => {
//       const line = chart.addLineSeries({ color: "#7E57C2", lineWidth: 2 });
//       line.setData(data);
//   }, [data]);
"use client";

import { useEffect, useRef } from "react";
import type { IChartApi } from "lightweight-charts";

/**
 * lightweight-charts kurulumu, ResizeObserver ve temizliği yönetir.
 *
 * @param height - Grafik yüksekliği (px)
 * @param setup - Grafik oluşturulduktan sonra seri eklemek için callback.
 *                (chart, mod) => { chart.addLineSeries(...); chart.addHistogramSeries(...); }
 *                İsteğe bağlı olarak bir cleanup fonksiyonu döndürebilir.
 * @param deps - useEffect bağımlılıkları (setup'ın yeniden çalışmasını tetikler)
 * @returns containerRef — <div ref={containerRef} className="w-full" style={{ height }} />'a bağlanır
 */
export function useLightweightChart(
    height: number,
    setup: (chart: IChartApi, mod: typeof import("lightweight-charts")) => (() => void) | void,
    deps: unknown[],
): { containerRef: React.RefObject<HTMLDivElement | null> } {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let chart: IChartApi | undefined;
        let ro: ResizeObserver | undefined;
        let disposed = false;

        (async () => {
            const mod = await import("lightweight-charts");
            if (disposed) return;
            const container = containerRef.current;
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

            try { chart.timeScale().fitContent(); } catch { /* ignore */ }

            // Call the component-specific setup
            setup(chart, mod);

            ro = new ResizeObserver(() => {
                try { chart?.applyOptions({ width: container.clientWidth, height }); } catch { /* ignore */ }
            });
            ro.observe(container);
        })();

        return () => {
            disposed = true;
            try { ro?.disconnect(); } catch { /* ignore */ }
            try { chart?.remove(); } catch { /* ignore */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [height, ...deps]);

    return { containerRef };
}
