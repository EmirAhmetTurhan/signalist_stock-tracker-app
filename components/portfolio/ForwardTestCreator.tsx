'use client';

import { useState } from 'react';
import { createForwardTest } from '@/lib/actions/forward-test.actions';
import { useRouter } from 'next/navigation';
import type { Timeframe } from '@/lib/ta/types';

export default function ForwardTestCreator({
  symbol,
  interval,
  strategyName,
  indicators,
  userId
}: {
  symbol: string;
  interval: string;
  strategyName: string;
  indicators: string[];
  userId?: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleStartTest = async (mode: 'shadow' | 'auto') => {
    if (!userId) {
      alert("Please sign in to start a forward test.");
      return;
    }

    setLoading(true);

    try {
      const result = await createForwardTest({
        name: `FT: ${strategyName}`,
        symbol,
        interval: interval as Timeframe,
        indicatorConfig: { activeIndicators: indicators },
        entryRule: {
          logic: 'AND',
          conditions: indicators.map(ind => ({ indicatorPath: `${ind}.signal`, operator: '==', value: 'BUY' }))
        },
        exitRule: {
          logic: 'AND',
          conditions: indicators.map(ind => ({ indicatorPath: `${ind}.signal`, operator: '==', value: 'SELL' }))
        },
        positionSizing: { mode: 'fixed_cash', value: 1000 },
        executionMode: mode,
        capitalAllocated: 10000,
      });

      if (result.success) {
        alert(`Forward test started in ${mode.toUpperCase()} mode!`);
        router.push('/portfolio');
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred while starting the forward test.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs text-gray-500 mr-2">Forward Test:</span>
      <button
        onClick={() => handleStartTest('shadow')}
        disabled={loading}
        className="px-3 py-1.5 bg-indigo-900/40 text-indigo-300 border border-indigo-700/50 rounded text-xs font-medium hover:bg-indigo-800/50 transition-colors disabled:opacity-50"
      >
        Start Shadow Test
      </button>
      <button
        onClick={() => handleStartTest('auto')}
        disabled={loading}
        className="px-3 py-1.5 bg-purple-900/40 text-purple-300 border border-purple-700/50 rounded text-xs font-medium hover:bg-purple-800/50 transition-colors disabled:opacity-50"
      >
        Start Auto Execution
      </button>
    </div>
  );
}
