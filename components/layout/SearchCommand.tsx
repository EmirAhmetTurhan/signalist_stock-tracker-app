"use client"

import { useEffect, useState } from "react"
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "@/components/ui/command"
import {Button} from "@/components/ui/button";
import Link from "next/link";
import {TrendingUp, Loader2} from "lucide-react";
import {searchStocks} from "@/lib/actions/finnhub.actions";
import {useDebounce} from "@/hooks/useDebounce";
import WatchlistButton from "@/components/watchlist/WatchlistButton";

export default function SearchCommand({ renderAs = 'button', label = 'Add stock', initialStocks }:SearchCommandProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [stocks, setStocks] = useState<StockWithWatchlistStatus[]>(initialStocks);
  const [watchlistSet, setWatchlistSet] = useState<Set<string>>(
      () => new Set((initialStocks || []).filter(s => s.isInWatchlist).map(s => s.symbol))
  );

  const isSearchMode = !!searchTerm.trim();
  const displayStocks = isSearchMode ? stocks : stocks?.slice(0, 10);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!searchTerm) {
      setLoading(false)
      return
    }
    setLoading(true)
    const id = setTimeout(() => setLoading(false), 300)
    return () => clearTimeout(id)
  }, [searchTerm])

  const handleSearch = async () => {
      if(!isSearchMode) return setStocks(initialStocks);

      setLoading(true)
      try {
          const results = await searchStocks(searchTerm.trim());
          // reflect current watchlist status in search results
          const withFlags = (results || []).map((s) => ({
              ...s,
              isInWatchlist: watchlistSet.has(s.symbol)
          }))
          setStocks(withFlags);
      } catch {
          setStocks([])
      } finally {
          setLoading(false)
      }
  }

  const debouncedSearch = useDebounce(handleSearch,300)

    useEffect(() => {
        debouncedSearch();
    }, [searchTerm]);

  const handleSelectStock = () => {
    setOpen(false);
    setSearchTerm("");
    setStocks(initialStocks);
  }

  return (
    <>
        {renderAs === 'text' ? (
            <span onClick={() => setOpen(true)} className="search-text">
                {label}
            </span>
        ) : (
            <Button onClick={() => setOpen(true)} className="search-btn">
                {label}
            </Button>
        )}

      <CommandDialog open={open} onOpenChange={setOpen} className="search-dialog">
        <div className="search-field">
            <CommandInput placeholder={loading ? "Searching..." : "Search stocks"} value={searchTerm} onValueChange={setSearchTerm} className="search-input"/>
            {loading && <Loader2 className="search-loader" />}
        </div>
        <CommandList className="search-list">
            {loading ? (
                <CommandEmpty className="search-list-empty">Loading stocks...</CommandEmpty>
            ) : displayStocks?.length === 0 ? (
                <div className="search-list-indicator">
                    {isSearchMode ? 'No results found' : 'No stocks available'}
                </div>
            ) : (
            <ul>
                <div className="search-count">
                    {isSearchMode ? 'Search results' : 'Popular stocks'}
                    {` `}({displayStocks?.length || 0})
                </div>
                {displayStocks?.map((stock) => (
                    <li key={stock.symbol} className="search-item">
                        <Link
                            href={`/stocks/${stock.symbol}`}
                            onClick={handleSelectStock}
                            className="search-item-link flex items-center gap-3 w-full px-3 py-2 rounded-md hover:bg-white/5 transition-colors group"
                        >
                            {/* Left: Symbol */}
                            <span className="text-sm font-bold text-gray-100 w-14 shrink-0">{stock.symbol}</span>
                            
                            {/* Center: Divider and Company Name */}
                            <div className="flex flex-1 items-center gap-2 border-l border-white/10 pl-3 min-w-0">
                                <span className="text-sm text-gray-400 truncate">
                                    {stock.name || 'Unknown Company'}
                                </span>
                            </div>
                            
                            {/* Right: Exchange Badge & Watchlist Button */}
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="text-[10px] bg-white/5 text-gray-500 px-1.5 py-0.5 rounded font-mono uppercase group-hover:bg-white/10 transition-colors">
                                    {stock.exchange}
                                </span>
                                <div
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                >
                                    <WatchlistButton
                                        type="icon"
                                        symbol={stock.symbol}
                                        company={stock.name}
                                        isInWatchlist={!!stock.isInWatchlist}
                                        onWatchlistChange={(symbol, isAdded) => {
                                            setWatchlistSet((prev) => {
                                                const next = new Set(prev);
                                                if (isAdded) next.add(symbol.toUpperCase()); else next.delete(symbol.toUpperCase());
                                                return next;
                                            });
                                            setStocks((prev) => prev.map((s) => s.symbol === symbol ? { ...s, isInWatchlist: isAdded } : s));
                                        }}
                                    />
                                </div>
                            </div>
                        </Link>
                    </li>
                ))}
            </ul>
            )
            }
        </CommandList>
      </CommandDialog>
    </>
  )
}
