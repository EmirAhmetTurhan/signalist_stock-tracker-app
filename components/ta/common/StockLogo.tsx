"use client";

import { useState, useEffect } from "react";

/**
 * Client-side stock logo fetcher.
 * Replaces the server-side Finnhub logo fetch that blocked every page render.
 * Fetches once, caches in sessionStorage, and doesn't block the initial render.
 */
export default function StockLogo({ symbol }: { symbol: string }) {
    const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!symbol) return;

        const cacheKey = `stock_logo_${symbol}`;
        const cached = sessionStorage.getItem(cacheKey);

        if (cached) {
            setLogoUrl(cached === "__none__" ? undefined : cached);
            setLoaded(true);
            return;
        }

        let cancelled = false;

        const fetchLogo = async () => {
            try {
                // Use the same fetchJSON approach but client-side
                const res = await fetch(`/api/stock/logo?symbol=${encodeURIComponent(symbol)}`);
                if (!res.ok) {
                    sessionStorage.setItem(cacheKey, "__none__");
                    if (!cancelled) setLoaded(true);
                    return;
                }
                const data = await res.json();
                const url = typeof data?.logo === "string" && data.logo ? data.logo : undefined;
                sessionStorage.setItem(cacheKey, url || "__none__");
                if (!cancelled) {
                    setLogoUrl(url);
                    setLoaded(true);
                }
            } catch {
                sessionStorage.setItem(cacheKey, "__none__");
                if (!cancelled) setLoaded(true);
            }
        };

        fetchLogo();
        return () => { cancelled = true; };
    }, [symbol]);

    // Show initial placeholder immediately (never blocks render)
    return (
        <div className="h-6 w-6 rounded bg-gray-700/60 flex items-center justify-center overflow-hidden">
            {loaded && logoUrl ? (
                <img src={logoUrl} alt={`${symbol} logo`} className="h-full w-full object-contain p-0.5" />
            ) : (
                <span className="text-white text-xs font-semibold">{symbol.slice(0, 1)}</span>
            )}
        </div>
    );
}
