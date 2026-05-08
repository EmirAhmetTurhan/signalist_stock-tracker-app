"use client";

import { useEffect, useRef } from "react";

type Props = {
  data: CandleDataPoint[];
  height?: number;
  almaData?: { time: string | number; value: number }[];
  almaStyleConfig?: { color: string; opacity: number; width: number; style: number };
  bbData?: { time: string | number; basis: number; upper: number; lower: number }[];
  bbStyleConfig?: { color: string; opacity: number; width: number };
};

function hexToRgba(hex: string, opacity: number) {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) cleanHex = cleanHex.split('').map(x => x + x).join('');
  if (cleanHex.length !== 6) return hex;
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
}

const LightweightCandleChart = ({ data, height = 520, almaData, almaStyleConfig, bbData, bbStyleConfig }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let chart: any | undefined;
    let series: any | undefined;
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

      // 1. Draw Candlesticks
      series = chart.addCandlestickSeries({
        upColor: "#0FEDBE",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#0FEDBE",
        wickDownColor: "#ef4444",
        wickUpColor: "#0FEDBE",
      });
      series.setData(data);

      // 2. Draw ALMA
      if (almaData && almaData.length > 0) {
        const styleConf = almaStyleConfig || { color: '#fbbf24', opacity: 100, width: 2, style: 0 };
        const almaSeries = chart.addLineSeries({
          color: hexToRgba(styleConf.color, styleConf.opacity),
          lineWidth: styleConf.width,
          lineStyle: styleConf.style,
          crosshairMarkerVisible: true,
          lastValueVisible: true,
          priceLineVisible: false,
        });
        almaSeries.setData(almaData);
      }

      // 3. Draw Bollinger Bands lines and Custom Fill Primitive
      if (bbData && bbData.length > 0) {
        const styleConf = bbStyleConfig || { color: '#3b82f6', opacity: 100, width: 1 };
        const lineColor = hexToRgba(styleConf.color, styleConf.opacity);
        const bgColor = hexToRgba(styleConf.color, Math.max(5, styleConf.opacity * 0.12));

        const upperSeries = chart.addLineSeries({
          color: lineColor,
          lineWidth: styleConf.width,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        upperSeries.setData(bbData.map(d => ({ time: d.time, value: d.upper })));

        const lowerSeries = chart.addLineSeries({
          color: lineColor,
          lineWidth: styleConf.width,
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        lowerSeries.setData(bbData.map(d => ({ time: d.time, value: d.lower })));

        const basisSeries = chart.addLineSeries({
          color: lineColor,
          lineWidth: styleConf.width,
          crosshairMarkerVisible: true,
          lastValueVisible: true,
          priceLineVisible: false,
        });
        basisSeries.setData(bbData.map(d => ({ time: d.time, value: d.basis })));

        // Attach custom primitive for filling between upper and lower bands
        class BandsFillPrimitive {
          chart: any;
          series: any;
          data: any[];
          color: string;

          constructor(chartApi: any, seriesApi: any, bandsData: any[], fillColor: string) {
            this.chart = chartApi;
            this.series = seriesApi;
            this.data = bandsData;
            this.color = fillColor;
          }

          updateAllViews() { }

          paneViews() {
            return [{
              zOrder: () => 'bottom', // Behind the series lines, but above grid
              renderer: () => ({
                draw: (target: any) => {
                  const drawFill = (ctx: CanvasRenderingContext2D) => {
                    const timeScale = this.chart.timeScale();
                    ctx.save();
                    ctx.fillStyle = this.color;
                    ctx.beginPath();

                    let hasPoints = false;

                    // Draw upper edge
                    for (let i = 0; i < this.data.length; i++) {
                      const d = this.data[i];
                      const x = timeScale.timeToCoordinate(d.time);
                      const y = this.series.priceToCoordinate(d.upper);
                      if (x === null || y === null) continue;
                      if (!hasPoints) { ctx.moveTo(x, y); hasPoints = true; }
                      else { ctx.lineTo(x, y); }
                    }

                    // Draw lower edge backwards
                    for (let i = this.data.length - 1; i >= 0; i--) {
                      const d = this.data[i];
                      const x = timeScale.timeToCoordinate(d.time);
                      const y = this.series.priceToCoordinate(d.lower);
                      if (x === null || y === null) continue;
                      ctx.lineTo(x, y);
                    }

                    if (hasPoints) {
                      ctx.fill();
                    }
                    ctx.restore();
                  };

                  if (target.useMediaCoordinateSpace) {
                    target.useMediaCoordinateSpace((scope: any) => drawFill(scope.context));
                  } else {
                    drawFill(target.context || target);
                  }
                }
              })
            }];
          }
        }

        try {
          basisSeries.attachPrimitive(new BandsFillPrimitive(chart, basisSeries, bbData, bgColor) as any);
        } catch (e) {
          console.error("Could not attach custom primitive:", e);
        }
      }

      try {
        // Ensure the full data range is visible
        chart.timeScale().fitContent();
      } catch { }

      // keep responsive
      ro = new ResizeObserver(() => {
        try {
          chart?.applyOptions({ width: container.clientWidth, height });
        } catch { }
      });
      ro.observe(container);
    })();

    return () => {
      disposed = true;
      try { ro?.disconnect(); } catch { }
      try { chart?.remove?.(); } catch { }
    };
  }, [JSON.stringify(data), JSON.stringify(almaData), JSON.stringify(almaStyleConfig), JSON.stringify(bbData), JSON.stringify(bbStyleConfig), height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightCandleChart;
