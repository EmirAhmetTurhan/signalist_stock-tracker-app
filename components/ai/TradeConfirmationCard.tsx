'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import type { ToolCardProps } from './registry';
import { executeTradeWithToken } from '@/lib/actions/ai-trade.actions';
import { toast } from 'sonner';

export default function TradeConfirmationCard({ data, isLast }: ToolCardProps) {
  const [status, setStatus] = useState<'pending' | 'loading' | 'success' | 'error'>('pending');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const symbol = data.symbol as string;
  const side = data.side as string;
  const quantity = data.quantity as number;
  const currentPrice = data.currentPrice as number;
  const tradeToken = data.tradeToken as string;

  if (!tradeToken) return null;

  const estimatedCost = currentPrice * quantity;
  const isBuy = side === 'BUY';

  const handleConfirm = async () => {
    setStatus('loading');
    setErrorMsg(null);

    try {
      const result = await executeTradeWithToken(tradeToken);

      if (result.success) {
        setStatus('success');
        toast.success(`Trade Executed: ${side} ${quantity} ${symbol}`);
      } else {
        setStatus('error');
        setErrorMsg(result.userMessage || result.error || 'Trade execution failed.');
        toast.error(result.userMessage || 'An error occurred.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMsg('An unexpected error occurred.');
      toast.error('Trade could not be completed.');
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-lg mb-2">
      {/* Header */}
      <div className={`p-4 border-b ${isBuy ? 'border-emerald-900/30 bg-emerald-900/10' : 'border-red-900/30 bg-red-900/10'}`}>
        <div className="flex items-center gap-2">
          <AlertTriangle className={`w-5 h-5 ${isBuy ? 'text-emerald-500' : 'text-red-500'}`} />
          <h3 className="font-semibold text-gray-100">Trade Proposal (Simulated)</h3>
        </div>
      </div>

      {/* Details */}
      <div className="p-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-500 uppercase">Action</div>
          <div className={`text-lg font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
            {side} {symbol}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Quantity</div>
          <div className="text-lg font-bold text-gray-200">{quantity} Shares</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Est. Price</div>
          <div className="text-md text-gray-300">${currentPrice?.toFixed(2) || 'N/A'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 uppercase">Est. Total</div>
          <div className="text-md font-semibold text-gray-200">${estimatedCost?.toLocaleString() || 'N/A'}</div>
        </div>
      </div>

      {/* Action / Status */}
      <div className="p-4 bg-gray-800/50 border-t border-gray-800 flex flex-col gap-2">
        {status === 'pending' && isLast && (
          <button
            onClick={handleConfirm}
            className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
              isBuy 
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white' 
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
          >
            Confirm & Execute Trade
          </button>
        )}
        
        {status === 'pending' && !isLast && (
          <div className="text-sm text-amber-500/80 text-center italic">
            This proposal is no longer valid because it has expired or a new message was sent.
          </div>
        )}

        {status === 'loading' && (
          <div className="flex items-center justify-center py-2 text-gray-400 gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Processing...
          </div>
        )}

        {status === 'success' && (
          <div className="flex items-center justify-center py-2 text-emerald-400 gap-2 text-sm bg-emerald-900/20 rounded-lg border border-emerald-900/50">
            <CheckCircle className="w-4 h-4" /> Trade Successfully Executed
          </div>
        )}

        {status === 'error' && (
          <div className="text-sm text-red-400 text-center p-2 bg-red-950/30 rounded-lg border border-red-900/50">
            {errorMsg}
          </div>
        )}
      </div>
    </div>
  );
}
