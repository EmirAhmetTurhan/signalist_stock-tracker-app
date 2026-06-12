'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { depositWithdrawAction } from '@/lib/actions/paper-trading.actions';

export default function DepositWithdrawModal({ walletId }: { walletId: string }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < 100 || val > 1000000) {
      toast.error('Amount must be between $100 and $1,000,000');
      return;
    }

    setIsSubmitting(true);
    const res = await depositWithdrawAction(walletId, val, type);
    setIsSubmitting(false);

    if (res.success) {
      toast.success(`${type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} successful`);
      setOpen(false);
    } else {
      toast.error(res.error || 'Failed to process transaction');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-gray-900 border-gray-800 hover:bg-gray-800 text-gray-300">
          Transfer Funds
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-950 border-gray-800 text-gray-200">
        <DialogHeader>
          <DialogTitle>Deposit / Withdraw</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 p-1 bg-gray-900 rounded-md mb-4">
          <button 
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${type === 'DEPOSIT' ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/50' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => setType('DEPOSIT')}
          >
            Deposit
          </button>
          <button 
            className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${type === 'WITHDRAW' ? 'bg-amber-950/50 text-amber-400 border border-amber-900/50' : 'text-gray-500 hover:text-gray-300'}`}
            onClick={() => setType('WITHDRAW')}
          >
            Withdraw
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Amount (USD)</label>
            <Input 
              type="number" 
              min="100" 
              max="1000000" 
              step="100"
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              className="bg-gray-900 border-gray-800"
            />
          </div>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {isSubmitting ? 'Processing...' : 'Confirm'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
