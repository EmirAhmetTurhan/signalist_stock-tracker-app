// app/api/portfolio/refresh-prices/route.ts — Lightweight price refresh endpoint
// Returns {symbol → currentPrice} for client-side P&L recomputation.
// Uses cached Finnhub quotes (60s revalidate) to minimize API pressure.

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbols: string[] = body?.symbols;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: 'symbols array required' }, { status: 400 });
    }

    // Cap at 20 symbols per request to prevent abuse
    const limited = symbols.slice(0, 20).map(s => s.toUpperCase().trim());
    const token = process.env.FINNHUB_API_KEY || '';
    if (!token) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const priceMap: Record<string, number> = {};

    await Promise.allSettled(
      limited.map(async (symbol) => {
        try {
          const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
          const res = await fetch(url, {
            cache: 'force-cache',
            next: { revalidate: 60 },
          } as RequestInit);

          if (!res.ok) return;
          const data = await res.json();
          if (data?.c && typeof data.c === 'number' && data.c > 0) {
            priceMap[symbol] = data.c;
          }
        } catch { /* ignore individual failures */ }
      })
    );

    return NextResponse.json({ prices: priceMap });
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
