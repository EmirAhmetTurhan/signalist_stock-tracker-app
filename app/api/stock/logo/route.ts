import { NextRequest, NextResponse } from 'next/server';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

/**
 * GET /api/stock/logo?symbol=AAPL
 * Proxies Finnhub's stock profile2 endpoint to fetch a company logo URL.
 * Cached via Next.js data cache with 24h revalidation.
 * This removes the blocking Finnhub call from the server-rendered TA page.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.toUpperCase().trim();

    if (!symbol) {
        return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    const token = process.env.FINNHUB_API_KEY || '';
    if (!token) {
        return NextResponse.json({ logo: null });
    }

    try {
        const profileUrl = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${token}`;
        const res = await fetch(profileUrl, {
            next: { revalidate: 86400 }, // 24h cache
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });

        if (!res.ok) {
            return NextResponse.json({ logo: null });
        }

        const data = await res.json();
        const logo = typeof data?.logo === 'string' && data.logo ? data.logo : null;
        return NextResponse.json({ logo });
    } catch {
        return NextResponse.json({ logo: null });
    }
}
