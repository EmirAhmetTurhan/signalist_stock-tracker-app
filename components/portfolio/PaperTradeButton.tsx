'use client';

// components/portfolio/PaperTradeButton.tsx — Compact button to open trade modal from stock detail page

import { useState } from 'react';
import ManualTradeModal from './ManualTradeModal';

interface PaperTradeButtonProps {
  symbol: string;
  userId: string;
}

export default function PaperTradeButton({ symbol, userId }: PaperTradeButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all"
      >
        <span className="text-xs">💹</span>
        Paper Trade
      </button>
      <ManualTradeModal
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        prefillSymbol={symbol}
      />
    </>
  );
}
