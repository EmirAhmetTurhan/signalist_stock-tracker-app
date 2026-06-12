'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { updateStrategyAllocationAction } from '@/lib/actions/paper-trading.actions';

interface IStrategyPortfolioItem {
  originalStrategyId: string;
  name?: string;
  weight: number;
}

export default function StrategyAllocationModal({ 
  walletId, 
  initialPortfolio = [], 
  initialSymbols = [] 
}: { 
  walletId: string, 
  initialPortfolio?: IStrategyPortfolioItem[],
  initialSymbols?: string[]
}) {
  const [open, setOpen] = useState(false);
  const [portfolio, setPortfolio] = useState<IStrategyPortfolioItem[]>(initialPortfolio);
  const [symbols, setSymbols] = useState<string>(initialSymbols.join(', '));
  const [availableStrategies, setAvailableStrategies] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open && availableStrategies.length === 0) {
      fetch('/api/strategies')
        .then(r => { if (!r.ok) throw new Error('Failed to fetch'); return r.json(); })
        .then(data => {
          setAvailableStrategies(data);
          
          // Map names to existing portfolio
          setPortfolio(prev => prev.map(p => {
            const found = data.find((s: any) => s._id === p.originalStrategyId);
            return found ? { ...p, name: found.name } : p;
          }));
        })
        .catch(e => { console.error(e); toast.error('Failed to load strategies'); });
    }
  }, [open, availableStrategies.length]);

  const totalWeight = portfolio.reduce((sum, p) => sum + p.weight, 0);

  const handleWeightChange = (index: number, weightStr: string) => {
    let w = parseFloat(weightStr);
    if (isNaN(w)) w = 0;
    const newPort = [...portfolio];
    newPort[index].weight = w;
    setPortfolio(newPort);
  };

  const handleAddStrategy = () => {
    const usedIds = portfolio.map(s => s.originalStrategyId);
    const unused = availableStrategies.find(s => !usedIds.includes(s._id));
    if (!unused) {
      toast.error('No more available strategies to add');
      return;
    }
    setPortfolio([...portfolio, { originalStrategyId: unused._id, name: unused.name, weight: 0.1 }]);
  };

  const handleRemove = (index: number) => {
    const newPort = [...portfolio];
    newPort.splice(index, 1);
    setPortfolio(newPort);
  };

  const handleSubmit = async () => {
    if (portfolio.length === 0) {
      toast.error('At least one strategy must be allocated');
      return;
    }

    if (Math.abs(totalWeight - 1.0) > 0.001) {
      toast.error('Total weight must equal 1.0 (100%)');
      return;
    }

    const activeSymbols = symbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
    if (activeSymbols.length === 0) {
      toast.error('Please enter at least one symbol');
      return;
    }

    setIsSubmitting(true);
    // Cleanup names before sending
    const cleanPortfolio = portfolio.map(p => ({
       originalStrategyId: p.originalStrategyId,
       weight: p.weight,
       engineVersion: '1.0.0'
    }));

    const res = await updateStrategyAllocationAction(walletId, cleanPortfolio, activeSymbols);
    setIsSubmitting(false);

    if (res.success) {
      toast.success('Allocation updated');
      setOpen(false);
    } else {
      toast.error(res.error || 'Failed to update allocation');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-gray-900 border-gray-800 hover:bg-gray-800 text-gray-300">
          Allocation Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-950 border-gray-800 text-gray-200 max-w-lg">
        <DialogHeader>
          <DialogTitle>Strategy Allocation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto premium-scrollbar pr-2">
          
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Active Symbols (comma separated)</label>
            <Input 
              value={symbols} 
              onChange={e => setSymbols(e.target.value)} 
              placeholder="AAPL, MSFT, SPY"
              className="bg-gray-900 border-gray-800 uppercase"
            />
          </div>

          <div className="pt-2 border-t border-gray-800">
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-gray-500">Strategies</label>
              <div className={`text-xs ${Math.abs(totalWeight - 1.0) < 0.001 ? 'text-emerald-500' : 'text-amber-500'}`}>
                Total Weight: {(totalWeight * 100).toFixed(0)}%
              </div>
            </div>
            
            {portfolio.length === 0 && <p className="text-xs text-gray-600 italic">No strategies allocated.</p>}
            
            <div className="space-y-2">
              {portfolio.map((strat, i) => (
                <div key={i} className="flex gap-2 items-center bg-gray-900/50 p-2 rounded-md border border-gray-800/50">
                  <div className="flex-1 truncate text-sm">
                    {strat.name || strat.originalStrategyId}
                  </div>
                  <Input 
                    type="number" 
                    step="0.05" 
                    min="0" 
                    max="1"
                    value={strat.weight} 
                    onChange={e => handleWeightChange(i, e.target.value)} 
                    className="w-20 bg-gray-900 border-gray-800 text-right h-8"
                  />
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(i)} className="text-red-500 hover:text-red-400 hover:bg-red-950/30 px-2 h-8">
                    ✕
                  </Button>
                </div>
              ))}
            </div>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleAddStrategy} 
              className="w-full mt-3 border-dashed border-gray-800 text-gray-400 hover:text-gray-300 hover:bg-gray-900"
            >
              + Add Strategy
            </Button>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-800">
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {isSubmitting ? 'Saving...' : 'Save Allocation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
