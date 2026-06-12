"use client";

import { useEffect, useRef, useState } from "react";
import { useLightweightChart } from "@/hooks/useLightweightChart";
import type { UTCTimestamp, Time, SeriesMarkerPosition, ISeriesApi, LineSeriesOptions } from "lightweight-charts";
import { CandlePattern } from "@/lib/indicators/candlePatterns";
import type { TradeMarker } from "@/lib/ta/signals";

// Prop tipleri — page.tsx'teki gerçek veri tipleriyle uyumlu
type Props = {
  data: CandleDataPoint[];
  height?: number;
  almaData?: { time: string | number; value?: number }[];
  almaStyleConfig?: { color: string; opacity: number; width: number; style: number };
  bbData?: { time: string | number; basis?: number; upper?: number; lower?: number }[];
  bbStyleConfig?: { color: string; opacity: number; width: number };
  candlePatterns?: CandlePattern[];
  fractalProjection?: { time: number; value: number }[];
  srLevels?: Array<{ price: number; type: 'support' | 'resistance'; touches: number; strength: number }>;
  tradeMarkers?: TradeMarker[];
  showBB?: boolean;
  showALMA?: boolean;
  showPatterns?: boolean;
  showSR?: boolean;
  showMarkers?: boolean;
  showFractals?: boolean;
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

// Branded type assertion helpers
const toUT = (t: number): UTCTimestamp => t as UTCTimestamp;
const toTime = (t: string | number): Time => t as Time;

const LightweightCandleChart = ({
  data,
  height = 520,
  almaData,
  almaStyleConfig,
  bbData,
  bbStyleConfig,
  candlePatterns,
  fractalProjection,
  srLevels,
  tradeMarkers,
  showBB = true,
  showALMA = true,
  showPatterns = true,
  showSR = true,
  showMarkers = true,
  showFractals = true,
}: Props) => {
  const [chartReady, setChartReady] = useState(false);

  // ── Series refs for imperative visibility toggling (avoids chart recreation) ──
  const bbSeriesRef = useRef<{ upper: ISeriesApi<'Line'>; lower: ISeriesApi<'Line'>; basis: ISeriesApi<'Line'> } | null>(null);
  const almaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ghostSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLinesRef = useRef<any[]>([]);

  const showBBRef = useRef(showBB);
  const showALMARef = useRef(showALMA);
  const showFractalsRef = useRef(showFractals);

  showBBRef.current = showBB;
  showALMARef.current = showALMA;
  showFractalsRef.current = showFractals;

  // ── Chart setup (does NOT depend on showBB/showALMA — toggle handled by effects below) ──
  const { containerRef } = useLightweightChart(height, (chart, mod) => {
    setChartReady(false);
    candlestickSeriesRef.current = null;
    bbSeriesRef.current = null;
    almaSeriesRef.current = null;
    ghostSeriesRef.current = null;
    // 1. Candlesticks
    const series = chart.addCandlestickSeries({
      upColor: "#0FEDBE",
      downColor: "#ef4444",
      borderDownColor: "#ef4444",
      borderUpColor: "#0FEDBE",
      wickDownColor: "#ef4444",
      wickUpColor: "#0FEDBE",
    });
    series.setData(data as Parameters<typeof series.setData>[0]);
    candlestickSeriesRef.current = series;

    // 2. ALMA overlay (initial visibility from ref)
    if (almaData && almaData.length > 0) {
      const styleConf = almaStyleConfig || { color: '#fbbf24', opacity: 100, width: 2, style: 0 };
      const s = chart.addLineSeries({
        color: hexToRgba(styleConf.color, styleConf.opacity),
        lineWidth: styleConf.width as 1 | 2 | 3 | 4,
        lineStyle: styleConf.style as 0 | 1 | 2 | 3 | 4,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: false,
        visible: showALMARef.current,
      });
      s.setData(almaData.map(d => ({ time: toTime(d.time), value: d.value })));
      almaSeriesRef.current = s;
    }

    // 3. Bollinger Bands overlay (initial visibility from ref)
    if (bbData && bbData.length > 0) {
      const styleConf = bbStyleConfig || { color: '#3b82f6', opacity: 100, width: 1 };
      const lineColor = hexToRgba(styleConf.color, styleConf.opacity);
      const bgColor = hexToRgba(styleConf.color, Math.max(5, styleConf.opacity * 0.12));
      const bbAsTime = bbData.map(d => ({ time: toTime(d.time), basis: d.basis, upper: d.upper, lower: d.lower }));

      const upperSeries = chart.addLineSeries({
        color: lineColor, lineWidth: styleConf.width as 1 | 2 | 3 | 4,
        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        visible: showBBRef.current,
      });
      upperSeries.setData(bbAsTime.map(d => ({ time: d.time, value: d.upper })));

      const lowerSeries = chart.addLineSeries({
        color: lineColor, lineWidth: styleConf.width as 1 | 2 | 3 | 4,
        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        visible: showBBRef.current,
      });
      lowerSeries.setData(bbAsTime.map(d => ({ time: d.time, value: d.lower })));

      const basisSeries = chart.addLineSeries({
        color: lineColor, lineWidth: styleConf.width as 1 | 2 | 3 | 4,
        crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: false,
        visible: showBBRef.current,
      });
      basisSeries.setData(bbAsTime.map(d => ({ time: d.time, value: d.basis })));

      bbSeriesRef.current = { upper: upperSeries, lower: lowerSeries, basis: basisSeries };

      // Custom fill primitive
      class BandsFillPrimitive {
        chart: any; series: any; data: any[]; color: string;
        constructor(chartApi: any, seriesApi: any, bandsData: any[], fillColor: string) {
          this.chart = chartApi; this.series = seriesApi; this.data = bandsData; this.color = fillColor;
        }
        updateAllViews() { }
        paneViews() {
          return [{
            zOrder: () => 'bottom' as const,
            renderer: () => ({
              draw: (target: any) => {
                if (!this.series.options().visible) return;
                const drawFill = (ctx: CanvasRenderingContext2D) => {
                  const timeScale = this.chart.timeScale();
                  ctx.save(); ctx.fillStyle = this.color; ctx.beginPath();
                  let hasPoints = false;
                  for (let i = 0; i < this.data.length; i++) {
                    const d = this.data[i];
                    const x = timeScale.timeToCoordinate(d.time);
                    const y = this.series.priceToCoordinate(d.upper);
                    if (x === null || y === null) continue;
                    if (!hasPoints) { ctx.moveTo(x, y); hasPoints = true; }
                    else { ctx.lineTo(x, y); }
                  }
                  for (let i = this.data.length - 1; i >= 0; i--) {
                    const d = this.data[i];
                    const x = timeScale.timeToCoordinate(d.time);
                    const y = this.series.priceToCoordinate(d.lower);
                    if (x === null || y === null) continue;
                    ctx.lineTo(x, y);
                  }
                  if (hasPoints) { ctx.fill(); }
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
        basisSeries.attachPrimitive(new BandsFillPrimitive(chart, basisSeries, bbAsTime, bgColor) as any);
      } catch (e) {
        console.error("Could not attach custom primitive:", e);
      }
    }

    // 4. Fractal Projection
    if (fractalProjection && fractalProjection.length > 1) {
      try {
        const ghostSeries = chart.addLineSeries({
          color: 'rgba(251, 191, 36, 0.75)',
          lineWidth: 2 as 1 | 2 | 3 | 4,
          lineStyle: 1 as 0 | 1 | 2 | 3 | 4,
          crosshairMarkerVisible: true,
          lastValueVisible: true,
          priceLineVisible: false,
          title: 'Projected Path',
          visible: showFractalsRef.current,
        });
        ghostSeries.setData(fractalProjection.map(p => ({ time: toUT(p.time), value: p.value })));
        ghostSeriesRef.current = ghostSeries;
      } catch (e) {
        console.warn('Could not draw fractal projection:', e);
      }
    }
    setChartReady(true);
  }, [data, almaData, almaStyleConfig, bbData, bbStyleConfig, fractalProjection]);

  // ── Imperative visibility toggles (no chart recreation) ──
  useEffect(() => {
    const ref = bbSeriesRef.current;
    if (ref) {
      ref.upper.applyOptions({ visible: showBB });
      ref.lower.applyOptions({ visible: showBB });
      ref.basis.applyOptions({ visible: showBB });
    }
  }, [showBB, chartReady]);

  useEffect(() => {
    almaSeriesRef.current?.applyOptions({ visible: showALMA });
  }, [showALMA, chartReady]);

  useEffect(() => {
    ghostSeriesRef.current?.applyOptions({ visible: showFractals });
  }, [showFractals, chartReady]);

  // Dynamic markers update effect (patterns + trade markers)
  useEffect(() => {
    const series = candlestickSeriesRef.current;
    if (!series) return;

    const allMarkers: Array<{
      time: Time;
      position: SeriesMarkerPosition;
      color: string;
      shape: 'arrowUp' | 'arrowDown' | 'circle';
      text: string;
      size: number;
    }> = [];

    if (showPatterns && candlePatterns && candlePatterns.length > 0) {
      for (const p of candlePatterns) {
        allMarkers.push({
          time: toTime(p.time),
          position: (p.signal === 'bearish' ? 'aboveBar' : 'belowBar') as SeriesMarkerPosition,
          color: p.signal === 'bullish' ? '#0FEDBE' : p.signal === 'bearish' ? '#ef4444' : '#f59e0b',
          shape: (p.signal === 'bullish' ? 'arrowUp' : p.signal === 'bearish' ? 'arrowDown' : 'circle') as 'arrowUp' | 'arrowDown' | 'circle',
          text: p.label,
          size: 1,
        });
      }
    }

    if (showMarkers && tradeMarkers && tradeMarkers.length > 0) {
      // Group tradeMarkers by time and signal direction to avoid overlapping
      const groups = new Map<string, TradeMarker[]>();
      for (const tm of tradeMarkers) {
        const key = `${tm.time}_${tm.signal}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(tm);
      }

      for (const [_, group] of groups) {
        const first = group[0];
        const isBuy = first.signal === 'BUY';

        // Count occurrences of each indicator label
        const counts = new Map<string, number>();
        for (const tm of group) {
          const label = tm.indicator.toUpperCase();
          counts.set(label, (counts.get(label) || 0) + 1);
        }

        // Format labels: e.g. "TS x4" or "TS x3 + ENTRY"
        const parts: string[] = [];
        for (const [label, count] of counts.entries()) {
          if (count > 1) {
            parts.push(`${label} x${count}`);
          } else {
            parts.push(label);
          }
        }
        const text = parts.join(' + ');

        allMarkers.push({
          time: toTime(first.time),
          position: (isBuy ? 'belowBar' : 'aboveBar') as SeriesMarkerPosition,
          color: isBuy ? '#0FEDBE' : '#ef4444',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text,
          size: 1,
        });
      }
    }

    if (allMarkers.length > 0) {
      allMarkers.sort((a, b) => (a.time as unknown as number) - (b.time as unknown as number));
    }

    try {
      series.setMarkers(allMarkers as Parameters<typeof series.setMarkers>[0]);
    } catch (e) {
      console.warn('Could not set markers:', e);
    }
  }, [showPatterns, showMarkers, candlePatterns, tradeMarkers, chartReady]);

  // Dynamic S/R lines update effect
  useEffect(() => {
    const series = candlestickSeriesRef.current;
    if (!series) return;

    // Clear existing price lines
    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch { /* ignore */ }
    }
    priceLinesRef.current = [];

    // Add new price lines if showSR is true
    if (showSR && srLevels && srLevels.length > 0) {
      for (const lvl of srLevels) {
        try {
          const line = series.createPriceLine({
            price: lvl.price,
            color: lvl.type === 'support'
              ? `rgba(16, 185, 129, ${0.4 + lvl.strength * 0.5})`
              : `rgba(239, 68, 68,  ${0.4 + lvl.strength * 0.5})`,
            lineWidth: lvl.touches >= 3 ? 2 : 1,
            lineStyle: 1,
            axisLabelVisible: true,
            title: `${lvl.type === 'support' ? 'S' : 'R'} ${lvl.touches}×`,
          });
          priceLinesRef.current.push(line);
        } catch { /* ignore */ }
      }
    }
  }, [showSR, srLevels, chartReady]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
};

export default LightweightCandleChart;
