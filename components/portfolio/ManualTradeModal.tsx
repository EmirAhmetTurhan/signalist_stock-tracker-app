'use client';

// components/portfolio/ManualTradeModal.tsx — Buy/Sell dialog for paper trading
// Symbol input, quantity, estimated cost preview, confirm button

import { useState, useEffect } from 'react';
import { executeManualTrade } from '@/lib/actions/trade.actions';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface ManualTradeModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  prefillSymbol?: string;
  prefillPrice?: number;
}

export default function ManualTradeModal({
  open,
  onClose,
  userId,
  prefillSymbol = '',
  prefillPrice,
}: ManualTradeModalProps) {
  const [symbol, setSymbol] = useState(prefillSymbol);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [quotePrice, setQuotePrice] = useState<number | null>(prefillPrice || null);
  const [requestId, setRequestId] = useState<string>('');
  const router = useRouter();

  // Initialize request ID on client side
  useEffect(() => {
    if (!requestId) setRequestId(crypto.randomUUID());
  }, [requestId]);

  // Reset form when opened with prefilled values
  useEffect(() => {
    if (open) {
      setSymbol(prefillSymbol);
      setQuotePrice(prefillPrice || null);
      setQuantity('');
      setError(null);
      setSuccess(null);
      setRequestId(crypto.randomUUID());
    }
  }, [open, prefillSymbol, prefillPrice]);

  // Fetch quote when symbol changes
  useEffect(() => {
    if (!symbol || symbol.length < 1) {
      setQuotePrice(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/portfolio/refresh-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: [symbol.toUpperCase()] }),
        });
        const data = await res.json();
        const price = data?.prices?.[symbol.toUpperCase()];
        if (price) setQuotePrice(price);
      } catch { /* ignore */ }
    }, 500);

    return () => clearTimeout(timer);
  }, [symbol]);

  const qty = parseInt(quantity) || 0;
  const estimatedCost = quotePrice && qty > 0 ? quotePrice * qty : null;

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!symbol.trim()) {
      setError('Hisse sembolü gerekli.');
      return;
    }
    if (qty <= 0) {
      setError('Adet pozitif bir tamsayı olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      // userId is derived server-side from the authenticated session (IDOR fix).
      const result = await executeManualTrade({
        symbol: symbol.toUpperCase(),
        side,
        quantity: qty,
        clientRequestId: `manual-${requestId}`,
      });

      if (result.success) {
        const msg = `${side === 'BUY' ? 'Alım' : 'Satım'} başarılı! ${symbol.toUpperCase()} × ${qty}`;
        setSuccess(msg);
        toast.success(msg);
        setTimeout(() => {
          onClose();
          router.refresh();
        }, 1200);
      } else {
        const errorMsg = ('userMessage' in result ? result.userMessage : (result as any).error) || 'İşlem başarısız oldu.';
        setError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (e) {
      setError('Beklenmeyen bir hata oluştu.');
      toast.error('Beklenmeyen bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-100">Paper Trade</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Side Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSide('BUY')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              side === 'BUY'
                ? 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            BUY
          </button>
          <button
            onClick={() => setSide('SELL')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              side === 'SELL'
                ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            SELL
          </button>
        </div>

        {/* Symbol Input */}
        <div className="mb-3">
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Symbol</label>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
            maxLength={10}
          />
        </div>

        {/* Quantity Input */}
        <div className="mb-3">
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-1.5">Quantity (shares)</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 10"
            min={1}
            step={1}
            className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
        </div>

        {/* Price & Cost Preview */}
        {quotePrice && (
          <div className="mb-4 p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Current Price</span>
              <span className="text-gray-300 font-medium">${quotePrice.toFixed(2)}</span>
            </div>
            {estimatedCost && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Estimated {side === 'BUY' ? 'Cost' : 'Proceeds'}</span>
                <span className={`font-semibold ${
                  side === 'BUY' ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  ${estimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="mt-1.5 text-[10px] text-gray-600">
              * Slippage simulation (5 bps) will be applied at execution
            </div>
          </div>
        )}

        {/* Error / Success */}
        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-950/30 border border-red-800/30 text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/30 text-emerald-400 text-sm">
            ✓ {success}
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !symbol || qty <= 0}
          className={`w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            side === 'BUY'
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
              : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30'
          }`}
        >
          {submitting
            ? 'İşlem yapılıyor...'
            : `${side === 'BUY' ? 'Buy' : 'Sell'} ${symbol || '...'} × ${qty || 0}`
          }
        </button>
      </div>
    </div>
  );
}
