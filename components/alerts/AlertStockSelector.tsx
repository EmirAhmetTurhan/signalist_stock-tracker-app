'use client';

import { useEffect, useState } from 'react';
import { searchStocks } from '@/lib/actions/finnhub.actions';
import { useDebounce } from '@/hooks/useDebounce';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type AlertStockSelectorProps = {
  defaultSymbol: string;
  defaultCompany: string;
  onChange?: (symbol: string, company: string) => void;
};

export default function AlertStockSelector({ defaultSymbol, defaultCompany, onChange }: AlertStockSelectorProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [symbol, setSymbol] = useState<string>((defaultSymbol || '').toUpperCase());
  const [company, setCompany] = useState<string>(defaultCompany || defaultSymbol || '');
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<StockWithWatchlistStatus[]>([]);

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
    if (!open) return;
    debouncedSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue, open]);

  const handleSelect = (item: StockWithWatchlistStatus) => {
    const upper = (item.symbol || '').toUpperCase();
    const name = item.name || upper;
    setSymbol(upper);
    setCompany(name);
    setOpen(false);
    onChange?.(upper, name);
  };

  const selectedText = symbol ? `${company} (${symbol})` : "Select a stock...";

  return (
    <div className="w-full">
      <label className="block text-sm text-gray-300 mb-2">Stock identifier</label>
      
      <input type="hidden" name="symbol" value={symbol} />
      <input type="hidden" name="company" value={company} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-[#0f0f0f] border-gray-700 text-gray-100 hover:bg-[#1a1a1a] hover:text-white"
          >
            <span className="truncate">{selectedText}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-[#0f0f0f] border-gray-700" align="start">
          <Command 
            className="bg-[#0f0f0f] text-gray-100" 
            filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}
          >
            <CommandInput 
              placeholder="Type to search stocks..." 
              value={inputValue}
              onValueChange={setInputValue}
              className="text-gray-100"
            />
            <CommandList>
              <CommandEmpty className="py-6 text-center text-sm text-gray-500">
                {loading ? "Searching..." : inputValue ? "No stocks found." : "Start typing to search stocks"}
              </CommandEmpty>
              {results.length > 0 && (
                <CommandGroup>
                  {results.map((item) => (
                    <CommandItem
                      key={item.symbol}
                      value={`${item.symbol} ${item.name}`}
                      onSelect={() => handleSelect(item)}
                      className="text-gray-100 data-[selected=true]:bg-white/5 cursor-pointer w-full px-3 py-2 rounded-md group"
                    >
                      <div className="flex w-full items-center gap-3">
                        {/* Left: Symbol */}
                        <span className="text-sm font-bold text-gray-100 w-14 shrink-0">{item.symbol}</span>
                        
                        {/* Center: Divider and Company Name */}
                        <div className="flex flex-1 items-center gap-2 border-l border-white/10 pl-3 min-w-0">
                          <span className="text-sm text-gray-400 truncate">{item.name || 'Unknown Company'}</span>
                        </div>
                        
                        {/* Right: Exchange Badge and Check */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded font-mono uppercase group-hover:bg-white/10 transition-colors">
                            {item.exchange}
                          </span>
                          <Check
                            className={cn(
                              "h-4 w-4 text-yellow-500 shrink-0",
                              symbol === item.symbol ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
