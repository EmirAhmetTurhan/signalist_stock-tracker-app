'use server';

export async function getCurrentPrice(symbol: string): Promise<number> {
  const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`;
  
  try {
    const response = await fetch(url, { next: { revalidate: 60 } }); // Cache for 60 seconds
    
    if (!response.ok) {
      console.error(`Finnhub quote API error for ${symbol}: ${response.statusText}`);
      return 0;
    }
    
    const data = await response.json();
    return data.c || 0; // Current price
  } catch (error) {
    console.error(`Failed to fetch current price for ${symbol}:`, error);
    return 0;
  }
}
