"use client";

import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { TrendingUp, Loader2 } from "lucide-react";
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
      <Button onClick={() => setOpen(true)} className="search-btn">Search Brands</Button>
      <CommandDialog open={open} onOpenChange={setOpen} className="search-dialog">
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
            <div className="search-list-indicator">No results</div>
          ) : (
            <ul>
              <div className="search-count">
                {isSearchMode ? "Search results" : "Popular stocks"}
                {` `}({displayStocks?.length || 0})
              </div>
              {displayStocks?.map((s) => (
                <li key={s.symbol} className="search-item flex items-center justify-between">
                  <Link href={`/ta?symbol=${encodeURIComponent(s.symbol)}`} onClick={handleSelect} className="search-item-link">
                    <TrendingUp className="h-4 w-4 text-gray-500" />
                    <div className="flex-1">
                      <div className="search-item-name">{s.name}</div>
                      <div className="text-sm text-gray-500">
                        {s.symbol} | {s.exchange} | {s.type}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
};

export default TASearch;
