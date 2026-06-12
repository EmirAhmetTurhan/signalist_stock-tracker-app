"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type OverlayKey = "bb" | "alma" | "patterns" | "sr" | "markers" | "fractals";

interface ToggleDef {
  key: OverlayKey;
  label: string;
  color: string; // badge rengi
}

interface ChartOverlayToggleProps {
  /** Hangi overlay'lerin toggle'lanabilir olduğunu belirtir */
  available?: OverlayKey[];
  /** Varsayılan görünürlük durumları */
  defaults?: Partial<Record<OverlayKey, boolean>>;
  /** Visibility değiştiğinde parent'a bildir */
  onChange?: (key: OverlayKey, visible: boolean) => void;
}

const TOGGLE_DEFS: ToggleDef[] = [
  { key: "bb", label: "Bollinger Bands", color: "#3b82f6" },
  { key: "alma", label: "ALMA", color: "#fbbf24" },
  { key: "patterns", label: "Patterns", color: "#f59e0b" },
  { key: "sr", label: "S/R Levels", color: "#10b981" },
  { key: "markers", label: "Trade Markers", color: "#22c55e" },
  { key: "fractals", label: "Fractals", color: "#a855f7" },
];

/**
 * Grafik overlay indikatörleri için göz simgeli toggle bar.
 * Sadece görsel çizimi açar/kapatır — hesaplama arkada devam eder.
 */
export default function ChartOverlayToggle({
  available = ["bb", "alma", "patterns", "sr", "markers", "fractals"],
  defaults = { bb: true, alma: true, patterns: true, sr: true, markers: true, fractals: true },
  onChange,
}: ChartOverlayToggleProps) {
  const [visibility, setVisibility] = useState<Record<OverlayKey, boolean>>(() => {
    const init: Record<OverlayKey, boolean> = {
      bb: true,
      alma: true,
      patterns: true,
      sr: true,
      markers: true,
      fractals: true,
    };
    for (const k of available) {
      init[k] = defaults[k] ?? true;
    }
    return init;
  });

  const toggle = (key: OverlayKey) => {
    setVisibility((prev) => {
      const next = !prev[key];
      onChange?.(key, next);
      return { ...prev, [key]: next };
    });
  };

  const defs = TOGGLE_DEFS.filter((d) => available.includes(d.key));
  if (defs.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 py-1 max-w-full">
      {defs.map((d) => {
        const visible = visibility[d.key];
        return (
          <button
            key={d.key}
            type="button"
            onClick={() => toggle(d.key)}
            title={`${visible ? "Gizle" : "Göster"}: ${d.label}`}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium
                       bg-gray-900/70 border border-gray-700/50 hover:border-gray-500/70
                       text-gray-300 hover:text-white transition-colors"
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: d.color, opacity: visible ? 1 : 0.3 }}
            />
            <span className={visible ? "" : "text-gray-500"}>{d.label}</span>
            {visible ? (
              <Eye className="w-3 h-3 text-gray-400" />
            ) : (
              <EyeOff className="w-3 h-3 text-gray-600" />
            )}
          </button>
        );
      })}
    </div>
  );
}
