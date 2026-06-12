"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  Command,
  CommandItem,
  CommandGroup,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { TrendingUp, Loader2, Search } from "lucide-react";
import { searchStocks } from "@/lib/actions/finnhub.actions";

// Simple search dialog used in T/A page. No watchlist interactions.
const TASearch = ({ initialStocks }: { initialStocks: StockWithWatchlistStatus[] }) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [stocks, setStocks] = useState<StockWithWatchlistStatus[]>(initialStocks || []);

  const isSearchMode = !!searchTerm.trim();
  const displayStocks = isSearchMode ? stocks : stocks?.slice(0, 10);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!isSearchMode) return setStocks(initialStocks);
      setLoading(true);
      try {
        const results = await searchStocks(searchTerm.trim());
        if (active) setStocks(results || []);
      } catch {
        if (active) setStocks([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    const id = setTimeout(run, 250);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [searchTerm]);

  const handleSelect = () => {
    setOpen(false);
    setSearchTerm("");
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className="search-btn">
        <Search className="w-3.5 h-3.5 opacity-60" />
        Search
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 search-dialog-content">
          <Command
            className="search-dialog"
            filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}
          >
            <div className="search-field">
              <CommandInput
                placeholder={loading ? "Searching..." : "Search brands (e.g. AAPL)"}
                value={searchTerm}
                onValueChange={setSearchTerm}
                className="search-input"
              />
              {loading && <Loader2 className="search-loader" />}
            </div>
            <CommandList className="search-list">
              {loading ? (
                <CommandEmpty className="search-list-empty">Loading...</CommandEmpty>
              ) : displayStocks?.length === 0 ? (
                <CommandEmpty className="search-list-empty">No results</CommandEmpty>
              ) : (
                <CommandGroup heading={isSearchMode ? `Search results (${displayStocks?.length || 0})` : `Popular stocks (${displayStocks?.length || 0})`}>
                  {displayStocks?.map((s) => (
                    <CommandItem
                      key={s.symbol}
                      value={`${s.symbol} ${s.name}`}
                      onSelect={() => {
                        window.location.href = `/ta?symbol=${encodeURIComponent(s.symbol)}`;
                        handleSelect();
                      }}
                      className="search-item cursor-pointer w-full px-3 py-2 rounded-md hover:bg-white/5 transition-colors group"
                    >
                      <div className="flex w-full items-center gap-3">
                        {/* Left: Symbol */}
                        <span className="text-sm font-bold text-gray-100 w-14 shrink-0">{s.symbol}</span>
                        
                        {/* Center: Divider and Company Name */}
                        <div className="flex flex-1 items-center gap-2 border-l border-white/10 pl-3 min-w-0">
                          <span className="text-sm text-gray-400 truncate">{s.name || 'Unknown Company'}</span>
                        </div>
                        
                        {/* Right: Exchange Badge */}
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded font-mono uppercase group-hover:bg-white/10 transition-colors">
                            {s.exchange}
                          </span>
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TASearch;
