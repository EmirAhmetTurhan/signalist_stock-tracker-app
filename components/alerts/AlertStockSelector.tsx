'use client';

import { useEffect, useRef, useState } from 'react';
import { searchStocks } from '@/lib/actions/finnhub.actions';
import { useDebounce } from '@/hooks/useDebounce';

type AlertStockSelectorProps = {
  defaultSymbol: string;
  defaultCompany: string;
};

export default function AlertStockSelector({ defaultSymbol, defaultCompany }: AlertStockSelectorProps) {
  const [inputValue, setInputValue] = useState<string>(() =>
    `${defaultCompany || defaultSymbol} (${(defaultSymbol || '').toUpperCase()})`
  );
  const [symbol, setSymbol] = useState<string>((defaultSymbol || '').toUpperCase());
  const [company, setCompany] = useState<string>(defaultCompany || defaultSymbol || '');
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<StockWithWatchlistStatus[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const runSearch = async () => {
    const q = inputValue.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await searchStocks(q);
      setResults(r || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const debouncedSearch = useDebounce(runSearch, 250);

  useEffect(() => {
    if (!open) return; // only search when dropdown is intended to be open
    debouncedSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, open]);

  const handleSelect = (item: StockWithWatchlistStatus) => {
    const upper = (item.symbol || '').toUpperCase();
    const name = item.name || upper;
    setSymbol(upper);
    setCompany(name);
    setInputValue(`${name} (${upper})`);
    setOpen(false);
  };

  return (
    <div className="w-full" ref={containerRef}>
      <label className="block text-sm text-gray-300 mb-2">Stock identifier</label>
      <div className="relative">
        {/* Hidden inputs bound to selected values */}
        <input type="hidden" name="symbol" value={symbol} />
        <input type="hidden" name="company" value={company} />

        <input
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type a company or symbol"
          className="w-full rounded-md bg-[#0f0f0f] border border-gray-700 px-3 py-2 text-gray-100 focus:outline-none"
          autoComplete="off"
        />

        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-700 bg-[#0f0f0f] shadow-lg max-h-64 overflow-auto">
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">Start typing to search stocks</div>
            ) : (
              <ul className="py-1">
                {results.map((item) => (
                  <li key={`${item.symbol}`}>
                    <button
                      type="button"
                      onClick={() => handleSelect(item)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-800 focus:bg-gray-800"
                    >
                      <div className="text-gray-100 text-sm font-medium">{item.name}</div>
                      <div className="text-xs text-gray-400">{item.symbol} | {item.exchange} | {item.type}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
