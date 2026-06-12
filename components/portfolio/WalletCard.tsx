'use client';

// components/portfolio/WalletCard.tsx — Cash balance, reserved funds, buying power, and reset button

import { useState } from 'react';
import { resetWallet } from '@/lib/actions/wallet.actions';
import { useRouter } from 'next/navigation';

interface WalletCardProps {
  wallet: {
    cashBalance: number;
    reservedBalance: number;
    initialBalance: number;
    resetCount: number;
  };
  // userId prop is kept for backward compatibility but no longer forwarded to
  // server actions. The server derives the user from the authenticated session
  // (IDOR fix).
  userId?: string;
}

export default function WalletCard({ wallet }: WalletCardProps) {
  const [resetting, setResetting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const buyingPower = wallet.cashBalance - wallet.reservedBalance;

  const handleReset = async () => {
    setResetting(true);
    try {
      const result = await resetWallet();
      if (result.success) {
        setShowConfirm(false);
        router.refresh();
      }
    } catch (e) {
      console.error('Reset wallet failed:', e);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-gray-900/30 border border-gray-800/50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Wallet</h3>
        <button
          onClick={() => setShowConfirm(true)}
          className="text-xs text-gray-600 hover:text-amber-400 transition-colors px-2 py-1 rounded border border-transparent hover:border-amber-800/30"
        >
          ↻ Reset
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Cash Available</div>
          <div className="text-lg font-semibold text-gray-200 tabular-nums">
            ${wallet.cashBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Reserved</div>
          <div className="text-lg font-semibold text-gray-400 tabular-nums">
            ${wallet.reservedBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wide mb-0.5">Buying Power</div>
          <div className="text-lg font-semibold text-blue-400 tabular-nums">
            ${buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-gray-100 mb-2">Portföyü Sıfırla?</h3>
            <p className="text-sm text-gray-400 mb-4">
              Tüm açık pozisyonlar kapatılacak, işlem geçmişi korunacak ve bakiye $10,000'a sıfırlanacak.
              Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={resetting}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {resetting ? 'Sıfırlanıyor...' : 'Sıfırla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
