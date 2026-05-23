'use client';

import { Bell, BellOff } from 'lucide-react';

type Props = {
  toolName: string;
  data: Record<string, unknown>;
  symbol?: string;
};

type AlertItem = {
  symbol?: string;
  threshold?: number;
  alertType?: string;
  active?: boolean;
  frequency?: string;
};

export default function AlertListCard({ data }: Props) {
  const alerts = (data.alerts as AlertItem[]) || [];

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 px-3 py-2.5">
        <span className="text-xs text-gray-500">No active alerts.</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700/30 bg-gray-800/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Bell className="h-3.5 w-3.5 text-yellow-400" />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Alerts ({alerts.length})</span>
      </div>
      <div className="space-y-1">
        {alerts.map((a, i) => (
          <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs bg-gray-800/60">
            {a.active === false ? (
              <BellOff className="h-3 w-3 text-gray-600" />
            ) : (
              <Bell className="h-3 w-3 text-yellow-500" />
            )}
            <span className="font-medium text-gray-200 text-[11px]">{a.symbol || '—'}</span>
            <span className="text-gray-500 text-[11px]">
              {a.alertType === 'upper' ? 'Above' : 'Below'} ${a.threshold}
            </span>
            {a.frequency && <span className="text-[10px] text-gray-600 ml-auto">{a.frequency}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
