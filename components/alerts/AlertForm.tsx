'use client';

import { useState, useEffect, useRef } from 'react';
import { createAlert } from '@/lib/actions/alerts.actions';
import { CONDITION_OPTIONS } from '@/lib/constants';
import AlertStockSelector from '@/components/alerts/AlertStockSelector';
import CancelButton from '@/components/alerts/CancelButton';
import { getQuote } from '@/lib/actions/finnhub.actions';

type AlertFormProps = {
  defaultSymbol: string;
  defaultCompany: string;
};

export default function AlertForm({ defaultSymbol, defaultCompany }: AlertFormProps) {
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [company, setCompany] = useState(defaultCompany);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  
  const [condition, setCondition] = useState(CONDITION_OPTIONS[0].value);
  const [threshold, setThreshold] = useState<string>('');
  
  const [alertName, setAlertName] = useState(`${defaultCompany || defaultSymbol} at Target`);
  const prevDefaultNameRef = useRef(`${defaultCompany || defaultSymbol} at Target`);

  useEffect(() => {
    const newDefaultName = `${company || symbol} at Target`;
    if (!alertName.trim() || alertName === prevDefaultNameRef.current) {
      setAlertName(newDefaultName);
    }
    prevDefaultNameRef.current = newDefaultName;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, symbol]);

  useEffect(() => {
    let active = true;
    setCurrentPrice(null); // Clear old price immediately so we don't validate against stale data
    setFetchingPrice(true);
    const fetchPrice = async () => {
      if (!symbol) {
        if (active) setFetchingPrice(false);
        return;
      }
      const quote = await getQuote(symbol);
      if (active) {
        if (quote?.c !== undefined) {
          setCurrentPrice(quote.c);
        }
        setFetchingPrice(false);
      }
    };
    fetchPrice();
    return () => { active = false; };
  }, [symbol]);

  // Validation Logic
  let validationError = null;
  const thresholdVal = parseFloat(threshold);
  
  if (fetchingPrice) {
    validationError = "Loading current price for validation...";
  } else if (currentPrice !== null && !isNaN(thresholdVal) && threshold.trim() !== '') {
    if (condition === 'greater' && thresholdVal <= currentPrice) {
      validationError = `Target must be strictly higher than current price ($${currentPrice.toFixed(2)})`;
    } else if (condition === 'less' && thresholdVal >= currentPrice) {
      validationError = `Target must be strictly lower than current price ($${currentPrice.toFixed(2)})`;
    }
  }

  let alertNameError = null;
  if (!alertName.trim()) {
    alertNameError = "Alert name is required.";
  }

  return (
    <form 
      action={createAlert} 
      className="space-y-5"
      onSubmit={(e) => {
        if (validationError || alertNameError) {
          e.preventDefault(); // Hard block submission if any validation fails
        }
      }}
    >
      <AlertStockSelector 
        defaultSymbol={defaultSymbol} 
        defaultCompany={defaultCompany} 
        onChange={(sym, comp) => {
          setSymbol(sym);
          setCompany(comp);
        }}
      />

      <div>
        <label className="block text-sm text-gray-300 mb-2">Alert Name</label>
        <input
          name="alertName"
          value={alertName}
          onChange={(e) => setAlertName(e.target.value)}
          className={`w-full rounded-md bg-[#0f0f0f] border ${alertNameError ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-gray-500'} px-3 py-2 text-gray-100 focus:outline-none focus:ring-1 transition-shadow`}
          placeholder="Apple at Discount"
        />
        {alertNameError && (
          <p className="mt-1 text-xs text-red-500">{alertNameError}</p>
        )}
      </div>

      <div>
        <label className="block text-sm text-gray-300 mb-2">Condition</label>
        <select 
          name="condition" 
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="w-full rounded-md bg-[#0f0f0f] border border-gray-700 px-3 py-2 text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-500 transition-shadow"
        >
          {CONDITION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm text-gray-300">Threshold value</label>
          <div className="text-sm text-gray-400">
            Current Price: {fetchingPrice ? (
              <span className="text-white opacity-50 ml-1">Fetching...</span>
            ) : currentPrice !== null ? (
              <strong className="text-white ml-1">${currentPrice.toFixed(2)}</strong>
            ) : (
              <span className="text-white opacity-50 ml-1">N/A</span>
            )}
          </div>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
          <input
            name="threshold"
            required
            type="text"
            value={threshold}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9.]/g, '');
              // Prevent multiple decimals if needed, but simple regex is usually enough for basic UI block
              setThreshold(val);
            }}
            placeholder="eg: 140"
            className={`w-full rounded-md bg-[#0f0f0f] border ${validationError ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-gray-500'} pl-7 pr-3 py-2 text-gray-100 focus:outline-none focus:ring-1 transition-shadow`}
          />
        </div>
        {validationError && (
          <p className="mt-1 text-xs text-red-500">{validationError}</p>
        )}
      </div>

      {/* Info Footer for Read-Only Fields */}
      <div className="flex items-center gap-6 pt-2 pb-2">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400">Alert type:</label>
          <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400 text-xs border border-purple-500/20">Price</span>
          <input type="hidden" name="alertType" value="Price" />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-400">Frequency:</label>
          <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">Once per day</span>
          <input type="hidden" name="frequency" value="daily" />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4 mt-6 border-t border-gray-800">
        <CancelButton />
        <button 
          type="submit" 
          disabled={!!validationError || !!alertNameError}
          className="ml-auto px-4 py-2 rounded-md bg-gradient-to-r from-yellow-300 to-yellow-500 text-black font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shadow-lg shadow-yellow-500/10"
        >
          Create Alert
        </button>
      </div>
    </form>
  );
}
