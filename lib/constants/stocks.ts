// Hisse Senedi Sabitleri

/** Full stock universe for search (255 stocks across US, EU, China markets). */
export const FINNHUB_STOCKS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'JPM', 'V', 'WMT',
    'JNJ', 'MA', 'PG', 'UNH', 'HD', 'BAC', 'DIS', 'ADBE', 'NFLX', 'CRM',
    'AMD', 'INTC', 'PFE', 'ABBV', 'KO', 'PEP', 'MRK', 'TMO', 'COST', 'CVX',
    'AVGO', 'ACN', 'DHR', 'LIN', 'NKE', 'TXN', 'QCOM', 'MDT', 'PM', 'NEE',
    'HON', 'RTX', 'ABT', 'AMGN', 'LOW', 'UPS', 'SPGI', 'IBM', 'CAT', 'AXP',
    'PLTR', 'CME', 'DE', 'BLK', 'GS', 'SCHW', 'BA', 'AMAT', 'MS', 'GILD',
    'ISRG', 'BSX', 'BDX', 'C', 'MMC', 'VRTX', 'ADI', 'PLD', 'MDLZ', 'CB',
    'TMUS', 'SYK', 'ZTS', 'EOG', 'REGN', 'CSCO', 'FISV', 'MO', 'ELV', 'TJX',
    'CI', 'WM', 'ATVI', 'LRCX', 'MCO', 'PGR', 'DUK', 'SO', 'MPC', 'VLO',
    'NOC', 'ITW', 'PSA', 'PH', 'HCA', 'APD', 'SHW', 'CTSH', 'MNST', 'ORLY',
    'AON', 'COP', 'TGT', 'AEP', 'SRE', 'MAR', 'NSC', 'ROST', 'KMI', 'FTNT',
    'D', 'PCG', 'GEV', 'CEG', 'VST', 'MSTR', 'APP', 'CRWD', 'SNOW', 'WDAY',
    'DASH', 'UBER', 'TTD', 'MRVL', 'MDB', 'ZS', 'HUBS', 'PINS', 'SNAP', 'DDOG',
    'NET', 'PATH', 'RBLX', 'TOST', 'ARM', 'NU', 'SOFI', 'HOOD', 'COIN', 'MRNA',
    'DKNG', 'LUCID', 'RIVN', 'RIOT', 'MARA', 'SQ', 'TWLO', 'OKTA', 'U', 'AFRM',
    'UPST', 'CPNG', 'SE', 'BIDU', 'BABA', 'JD', 'NTES', 'PDD', 'LI', 'NIO',
    'XPEV', 'TCEHY', 'TSM', 'ASML', 'SAP', 'BN', 'HSBC',
] as const;

export type FinnhubStock = (typeof FINNHUB_STOCKS)[number];
export const FinnhubStockSet = new Set<string>(FINNHUB_STOCKS);

export const POPULAR_STOCK_SYMBOLS = [
    // Tech Giants
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'ORCL', 'CRM',
    // Growing Tech
    'ADBE', 'INTC', 'AMD', 'PYPL', 'UBER', 'ZOOM', 'SPOT', 'SQ', 'SHOP', 'ROKU',
    // Newer Tech
    'SNOW', 'PLTR', 'COIN', 'RBLX', 'DDOG', 'CRWD', 'NET', 'OKTA', 'TWLO', 'ZM',
    // Consumer & Delivery
    'DOCU', 'PTON', 'PINS', 'SNAP', 'LYFT', 'DASH', 'ABNB', 'RIVN', 'LCID', 'NIO',
    // International
    'XPEV', 'LI', 'BABA', 'JD', 'PDD', 'TME', 'BILI', 'DIDI', 'GRAB', 'SE',
];

export const NO_MARKET_NEWS =
    '<p class="mobile-text" style="margin:0 0 20px 0;font-size:16px;line-height:1.6;color:#4b5563;">No market news available today. Please check back tomorrow.</p>';

export const WATCHLIST_TABLE_HEADER = [
    'Company', 'Symbol', 'Price', 'Change', 'Market Cap', 'P/E Ratio', 'Alert', 'Action',
];
