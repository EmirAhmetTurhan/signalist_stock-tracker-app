'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createSimulation } from '@/lib/actions/simulation.actions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useSimulationModal } from '@/lib/store/useSimulationModal';
import AlertStockSelector from '@/components/alerts/AlertStockSelector';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon, BarChart3, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default function SimulationCreationModal() {
  const router = useRouter();
  const { isOpen, setIsOpen } = useSimulationModal();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('My Quant Strategy');

  // Initial Capital Input
  const [initialBalanceStr, setInitialBalanceStr] = useState('100000');

  // ─── Backtest Period State (TATimeframes pattern) ───
  const today = new Date();

  const [interval, setIntervalState] = useState<'1d' | '4h'>('1d');
  const [years, setYears] = useState(1);
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [customStartDate, setCustomStartDate] = useState<Date>(today);
  const [customEndDate, setCustomEndDate] = useState<Date>(today);

  // Computed max years per interval: 1d → 10, 4h → 2
  const maxYears = interval === '1d' ? 10 : 2;

  // Computed start/end dates
  const startDate = isCustomRange
    ? customStartDate
    : (() => { const d = new Date(today); d.setFullYear(d.getFullYear() - years); return d; })();
  const endDate = isCustomRange ? customEndDate : new Date(today);

  const MIN_DATE = new Date(today.getFullYear() - maxYears, today.getMonth(), today.getDate());

  // Edge case: Custom Range + Interval değişimi → clamp startDate
  useEffect(() => {
    if (isCustomRange && customStartDate) {
      const maxStartDate = new Date();
      maxStartDate.setFullYear(maxStartDate.getFullYear() - maxYears);
      if (customStartDate < maxStartDate) {
        setCustomStartDate(maxStartDate);
        toast.warning(`Start date adjusted to ${maxYears} years ago (max for ${interval})`);
      }
    }
  }, [interval, maxYears, isCustomRange, customStartDate]);

  const [benchmarkSymbol, setBenchmarkSymbol] = useState('SPY');
  const [testSymbol, setTestSymbol] = useState('AAPL');
  const [positionSizing, setPositionSizing] = useState('all_in');

  // Strategy selection state
  const [strategies, setStrategies] = useState<{ originalStrategyId: string; name: string; weightStr: string; }[]>([]);
  const [availableStrategies, setAvailableStrategies] = useState<any[]>([]);

  useEffect(() => {
    async function loadStrategies() {
      try {
        const res = await fetch('/api/strategies');
        if (res.ok) {
          const data = await res.json();
          setAvailableStrategies(data);
          if (data.length > 0) {
             setStrategies([{ originalStrategyId: data[0]._id, name: data[0].name, weightStr: '1.0' }]);
          }
        }
      } catch (e) {
        console.error('Failed to load strategies', e);
        setStrategies([{ originalStrategyId: '65e3b9f4a1c5d9a8f1b2c3d4', name: 'Momentum Trend Follower', weightStr: '1.0' }]);
      }
    }
    loadStrategies();
  }, []);

  const handleAddStrategy = () => {
    if (strategies.length >= 10) {
      toast.error('Maximum 10 strategies allowed per simulation.');
      return;
    }

    const usedIds = strategies.map(s => s.originalStrategyId);
    const unused = availableStrategies.find(s => !usedIds.includes(s._id));
    
    if (unused) {
      setStrategies([...strategies, { originalStrategyId: unused._id, name: unused.name, weightStr: '0.0' }]);
    } else if (availableStrategies.length > 0) {
      setStrategies([...strategies, { originalStrategyId: availableStrategies[0]._id, name: availableStrategies[0].name, weightStr: '0.0' }]);
    } else {
      toast.error('No strategies available to add');
    }
  };

  const handleWeightChange = (index: number, newWeightStr: string) => {
    const newStrats = [...strategies];
    newStrats[index].weightStr = newWeightStr;
    setStrategies(newStrats);
  };

  const handleRemoveStrategy = (index: number) => {
    const newStrats = [...strategies];
    newStrats.splice(index, 1);
    setStrategies(newStrats);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Weight validation
    const parsedStrategies = strategies.map(s => ({
      ...s,
      weight: parseFloat(s.weightStr.replace(',', '.')) || 0
    }));

    const totalWeight = parsedStrategies.reduce((sum, s) => sum + s.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      toast.error(`Total strategy weights must sum to 1.0 (Current: ${totalWeight.toFixed(2)})`);
      return;
    }

    if (startDate >= endDate) {
      toast.error('Start date must be before end date.');
      return;
    }

    const initialBalance = parseFloat(initialBalanceStr.replace(',', '.')) || 0;
    if (initialBalance <= 0) {
      toast.error('Initial capital must be greater than 0');
      return;
    }

    if (!testSymbol || testSymbol.length < 1 || testSymbol.length > 10) {
      toast.error('Please search and select a test symbol');
      return;
    }

    setLoading(true);

    try {
      const strategyPortfolio = parsedStrategies.map(s => ({
        originalStrategyId: s.originalStrategyId,
        weight: s.weight,
        engineVersion: 'v1.0.0',
        indicators: [],
        bestParams: {},
        riskProfile: {}
      }));

      const res = await createSimulation({
        name,
        initialBalance,
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        testSymbol,
        benchmarkSymbol,
        interval,
        positionSizingConfig: { type: positionSizing },
        strategyPortfolio
      });

      if (res.success && res.simulationId) {
        toast.success('Simulation launched!');
        setIsOpen(false);
        router.push(`/portfolio/simulations/${res.simulationId}`);
      } else {
        toast.error(res.error || 'Failed to start simulation');
      }
    } catch (error) {
      toast.error('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-gray-950/90 backdrop-blur-xl border-gray-800 text-gray-100 premium-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold text-yellow-400">Configure Simulation Engine</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Test Symbol — reuses AlertStockSelector (same component as Add Alert → Stock identifier) */}
          <AlertStockSelector
            defaultSymbol="AAPL"
            defaultCompany="Apple Inc."
            onChange={(symbol) => setTestSymbol(symbol)}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-400">Simulation Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} maxLength={200} required className="bg-gray-900 border-gray-700 text-gray-100 focus:border-yellow-500" />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400">Initial Capital ($)</Label>
              <Input type="number" step="0.01" min="0.01" max="10000000" inputMode="decimal" value={initialBalanceStr} onChange={e => setInitialBalanceStr(e.target.value)} required className="bg-gray-900 border-gray-700 text-gray-100 focus:border-yellow-500" />
            </div>
          </div>

          {/* ─── Backtest Period (TATimeframes pattern) ─── */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 space-y-4">
            <Label className="text-gray-300 font-semibold">Backtest Period</Label>

            {/* Interval Selection Grid */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="w-3 h-3 text-gray-400" />
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Interval</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { value: '4h' as const, shortLabel: '4H', label: '4 Hours' },
                  { value: '1d' as const, shortLabel: '1D', label: '1 Day' },
                ].map((opt) => {
                  const isSelected = interval === opt.value;
                  const optMax = opt.value === '1d' ? 10 : 2;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setIntervalState(opt.value); setIsCustomRange(false); }}
                      className={cn(
                        'flex flex-col items-center gap-0.5 py-2 px-1 rounded-lg transition-all duration-150',
                        isSelected
                          ? 'bg-yellow-500/10 border border-yellow-500/30'
                          : 'hover:bg-white/5 border border-transparent'
                      )}
                      title={`${opt.label} — Max ${optMax} years`}
                    >
                      <span className={cn('text-xs font-semibold', isSelected ? 'text-yellow-400' : 'text-gray-400')}>
                        {opt.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4H Noise Warning (DÜZELTME 3) */}
            {interval === '4h' && (
              <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>4H timeframe has higher market noise. Stop-Loss may trigger more frequently. Consider testing on 1D first for trend-following strategies.</span>
              </div>
            )}

            {/* Data Depth: Slider or Custom Range */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3 text-gray-400" />
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Data Depth</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-300">
                    {isCustomRange
                      ? `${format(startDate, 'MMM dd, yyyy')} → ${format(endDate, 'MMM dd, yyyy')}`
                      : years >= maxYears
                        ? `${maxYears} Years (Max)`
                        : `${years} Year${years === 1 ? '' : 's'}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsCustomRange(!isCustomRange)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded border transition-colors',
                      isCustomRange
                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                        : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                    )}
                  >
                    {isCustomRange ? 'Use Presets' : 'Custom Range'}
                  </button>
                </div>
              </div>

              {isCustomRange ? (
                /* Custom Range: 2 Calendar Popovers */
                <div className="grid grid-cols-2 gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" type="button" className={cn(
                        'justify-start text-left font-normal bg-gray-900 border-gray-700 text-gray-100 hover:bg-gray-800 h-9 text-xs',
                        !customStartDate && 'text-muted-foreground'
                      )}>
                        <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                        {customStartDate ? format(customStartDate, 'MMM dd, yyyy') : 'Start'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-800" align="start">
                      <Calendar
                        mode="single"
                        selected={customStartDate}
                        onSelect={(date) => date && setCustomStartDate(date)}
                        captionLayout="dropdown"
                        startMonth={MIN_DATE}
                        endMonth={today}
                        disabled={[{ before: MIN_DATE }, { after: customEndDate || today }]}
                        className="text-gray-100"
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" type="button" className={cn(
                        'justify-start text-left font-normal bg-gray-900 border-gray-700 text-gray-100 hover:bg-gray-800 h-9 text-xs',
                        !customEndDate && 'text-muted-foreground'
                      )}>
                        <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                        {customEndDate ? format(customEndDate, 'MMM dd, yyyy') : 'End'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 bg-gray-900 border-gray-800" align="start">
                      <Calendar
                        mode="single"
                        selected={customEndDate}
                        onSelect={(date) => date && setCustomEndDate(date)}
                        captionLayout="dropdown"
                        startMonth={MIN_DATE}
                        endMonth={today}
                        disabled={[{ before: customStartDate || MIN_DATE }, { after: today }]}
                        className="text-gray-100"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              ) : (
                /* Slider (native range input, TATimeframes CSS birebir) */
                <div className="relative mb-2">
                  <input
                    type="range"
                    min={0.5}
                    max={maxYears}
                    step={0.5}
                    value={years}
                    onChange={(e) => setYears(Number(e.target.value))}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer
                      accent-yellow-500
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:bg-yellow-500 [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:cursor-pointer
                      [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(234,179,8,0.5)]"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                    <span>0.5 Year</span>
                    <span>{maxYears} Years</span>
                  </div>
                </div>
              )}
            </div>

            {/* 4H >2Y Synthetic Data Warning (UX 2) */}
            {interval === '4h' && years > 2 && !isCustomRange && (
              <div className="flex items-start gap-2 text-[11px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Data beyond 2 years uses synthetic 4H bars (generated from daily). Backtest results may be less accurate.</span>
              </div>
            )}
          </div>

          {/* Position Sizing 4H Warning (DÜZELTME 4) */}
          {interval === '4h' && positionSizing === 'risk_based' && (
            <div className="flex items-start gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Risk-Based sizing in 4H may result in larger positions due to smaller ATR values. Consider using Fixed Fractional for intraday.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-gray-400" title="Benchmark market index to compare your strategy against. Data: Yahoo Finance (primary), Finnhub (fallback).">Benchmark Symbol</Label>
              <Select value={benchmarkSymbol} onValueChange={setBenchmarkSymbol} required>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-gray-100 focus:ring-yellow-500" title="Benchmark is the market index you will compare your strategy's performance against.">
                  <SelectValue placeholder="Select benchmark" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                  <SelectItem value="SPY">SPY (S&P 500)</SelectItem>
                  <SelectItem value="QQQ">QQQ (Nasdaq 100)</SelectItem>
                  <SelectItem value="IWM">IWM (Russell 2000)</SelectItem>
                  <SelectItem value="DIA">DIA (Dow Jones)</SelectItem>
                  <SelectItem value="VTI">VTI (Total Stock Market)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-400">Position Sizing</Label>
              <Select value={positionSizing} onValueChange={setPositionSizing}>
                <SelectTrigger className="bg-gray-900 border-gray-700 text-gray-100 focus:ring-yellow-500 h-auto py-2">
                  <SelectValue placeholder="Select sizing" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-700 text-gray-100">
                  <SelectItem value="all_in">
                    <div className="flex flex-col text-left">
                      <span>All-In</span>
                      <span className="text-xs text-gray-500">Use 100% of capital in a single trade</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="fixed_fractional">
                    <div className="flex flex-col text-left">
                      <span>Fixed Fractional</span>
                      <span className="text-xs text-gray-500">Fixed percentage of capital per trade</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="risk_based">
                    <div className="flex flex-col text-left">
                      <span>Risk Based (1%)</span>
                      <span className="text-xs text-gray-500">Risk 1% of total portfolio per trade</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="half_kelly">
                    <div className="flex flex-col text-left">
                      <span>Half Kelly</span>
                      <span className="text-xs text-gray-500">Optimal growth via Kelly Criterion</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Strategy Portfolio Builder */}
          <div className="space-y-3 bg-gray-900/50 p-4 border border-gray-800 rounded-lg">
            <div className="flex justify-between items-center">
              <Label className="text-gray-300 font-semibold">Strategy Portfolio Weights</Label>
              <button type="button" onClick={handleAddStrategy} className="text-xs text-yellow-400 hover:text-yellow-300 transition-colors">+ Add Strategy</button>
            </div>
            {strategies.map((strat, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <Select 
                  value={strat.originalStrategyId} 
                  onValueChange={(val) => {
                    const newStrats = [...strategies];
                    const selected = availableStrategies.find(s => s._id === val);
                    newStrats[idx].originalStrategyId = val;
                    newStrats[idx].name = selected ? selected.name : strat.name;
                    setStrategies(newStrats);
                  }}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300 focus:ring-yellow-500">
                    <SelectValue placeholder="Select Strategy" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700 text-gray-300">
                    {availableStrategies.map(s => (
                      <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                    ))}
                    {availableStrategies.length === 0 && <SelectItem value={strat.originalStrategyId}>{strat.name}</SelectItem>}
                  </SelectContent>
                </Select>
                <Input 
                  type="number" 
                  step="0.05" 
                  min="0" 
                  max="1" 
                  inputMode="decimal"
                  value={strat.weightStr} 
                  onChange={e => handleWeightChange(idx, e.target.value)} 
                  className="w-24 bg-gray-900 border-gray-700 text-gray-100 focus:border-yellow-500" 
                />
                <Button 
                  type="button"
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleRemoveStrategy(idx)} 
                  className="text-red-500 hover:text-red-400 hover:bg-red-950/30 px-2 h-8"
                >
                  ✕
                </Button>
              </div>
            ))}
            <div className="text-right text-xs text-gray-500">
              Total Weight: <span className={strategies.reduce((a,b)=>a+(parseFloat(b.weightStr.replace(',', '.'))||0),0) === 1 ? 'text-yellow-500' : 'text-red-500'}>
                {strategies.reduce((a,b)=>a+(parseFloat(b.weightStr.replace(',', '.'))||0),0).toFixed(2)}
              </span>
            </div>
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-semibold shadow-[0_0_15px_rgba(234,179,8,0.3)] h-12 text-lg transition-all">
            {loading ? 'Booting Engine...' : 'Run Simulation'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
