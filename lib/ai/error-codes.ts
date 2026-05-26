// lib/ai/error-codes.ts — Standardize edilmis hata kodlari ve kullanici mesajlari
// Client ve server arasinda tutarli hata iletisimi icin tek kaynak

export type ErrorCode =
  | 'EXTERNAL_API_DENIED'
  | 'EXTERNAL_API_RATE_LIMIT'
  | 'EXTERNAL_API_TIMEOUT'
  | 'INSUFFICIENT_DATA'
  | 'INVALID_SYMBOL'
  | 'OPTIMIZATION_FAILED'
  | 'INNGEST_QUEUE_FULL'
  | 'INTERNAL_ERROR'
  // Paper Trading error codes
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_QUANTITY'
  | 'INVALID_POSITION'
  | 'MARKET_CLOSED'
  | 'STALE_QUOTE'
  | 'PRICE_DEVIATION_TOO_HIGH'
  | 'POSITION_LIMIT_EXCEEDED'
  | 'STRATEGY_NOT_RUNNING'
  | 'ORDER_EXPIRED'
  | 'DELISTED_SYMBOL'
  | 'RESERVED_FUNDS_INSUFFICIENT';

export interface ErrorInfo {
  userMessage: string;
  recoverable: boolean;
  action?: 'retry' | 'check_api' | 'try_different_symbol' | 'contact_support' | 'adjust_quantity' | 'check_position' | 'wait_market_open';
}

export const ERROR_MAP: Record<ErrorCode, ErrorInfo> = {
  EXTERNAL_API_DENIED: {
    userMessage: 'Borsa veri saglayicisi (Finnhub) erisimi reddetti. API planinizi kontrol edin veya daha sonra tekrar deneyin.',
    recoverable: true,
    action: 'check_api',
  },
  EXTERNAL_API_RATE_LIMIT: {
    userMessage: 'API istek limitine ulasildi (60 istek/dakika). Lutfen 1 dakika bekleyip tekrar deneyin.',
    recoverable: true,
    action: 'retry',
  },
  EXTERNAL_API_TIMEOUT: {
    userMessage: 'Borsa veri saglayicisi yanit vermedi. Sunucular yogun olabilir, tekrar deneyin.',
    recoverable: true,
    action: 'retry',
  },
  INSUFFICIENT_DATA: {
    userMessage: 'Bu hisse için yeterli gecmis veri bulunamadi. Hisse piyasada yeni olabilir veya veri kaynagi bu sembolu desteklemiyor.',
    recoverable: false,
    action: 'try_different_symbol',
  },
  INVALID_SYMBOL: {
    userMessage: 'Gecersiz hisse sembolu. Sembolu kontrol edip tekrar deneyin veya hisse arama ozelligini kullanin.',
    recoverable: false,
    action: 'try_different_symbol',
  },
  OPTIMIZATION_FAILED: {
    userMessage: 'Teknik analiz motorunda bir hesaplama hatasi olustu. Farkli bir indikator veya zaman araligi deneyin.',
    recoverable: false,
    action: 'try_different_symbol',
  },
  INNGEST_QUEUE_FULL: {
    userMessage: 'Arka plan islem kuyrugu su anda dolu. Biraz bekleyip tekrar deneyin.',
    recoverable: true,
    action: 'retry',
  },
  INTERNAL_ERROR: {
    userMessage: 'Beklenmeyen bir sistem hatasi olustu. Lutfen daha sonra tekrar deneyin.',
    recoverable: false,
    action: 'contact_support',
  },
  // --- Paper Trading error codes ---
  INSUFFICIENT_FUNDS: {
    userMessage: 'Yetersiz bakiye. Islem icin gereken tutar mevcut nakitten fazla.',
    recoverable: true,
    action: 'adjust_quantity',
  },
  INVALID_QUANTITY: {
    userMessage: 'Gecersiz adet. Adet pozitif bir tamsayi olmalidir.',
    recoverable: false,
    action: 'adjust_quantity',
  },
  INVALID_POSITION: {
    userMessage: 'Gecersiz pozisyon. Bu hisseden yeterli adette sahip degilsiniz veya acik pozisyon bulunmuyor.',
    recoverable: false,
    action: 'check_position',
  },
  MARKET_CLOSED: {
    userMessage: 'Piyasa su anda kapali. Islem piyasa acildiginda gerçeklestirilecektir.',
    recoverable: true,
    action: 'wait_market_open',
  },
  STALE_QUOTE: {
    userMessage: 'Fiyat verisi guncel degil. Lutfen birkaç saniye bekleyip tekrar deneyin.',
    recoverable: true,
    action: 'retry',
  },
  PRICE_DEVIATION_TOO_HIGH: {
    userMessage: 'Fiyat son kapanis fiyatindan cok fazla sapma gosteriyor. Bu bir veri hatasi olabilir.',
    recoverable: true,
    action: 'retry',
  },
  POSITION_LIMIT_EXCEEDED: {
    userMessage: 'Maksimum pozisyon limitine ulasildi. Yeni pozisyon acmadan once mevcut pozisyonlari kapatmaniz gerekiyor.',
    recoverable: false,
    action: 'check_position',
  },
  STRATEGY_NOT_RUNNING: {
    userMessage: 'Strateji su anda calismiyor. Stratejiyi baslatip tekrar deneyin.',
    recoverable: false,
    action: 'retry',
  },
  ORDER_EXPIRED: {
    userMessage: 'Emir suresi dolmus. Lutfen yeni bir emir girin.',
    recoverable: false,
    action: 'retry',
  },
  DELISTED_SYMBOL: {
    userMessage: 'Bu hisse borsadan cikarilmis (delisted). Islem yapilamaz.',
    recoverable: false,
    action: 'try_different_symbol',
  },
  RESERVED_FUNDS_INSUFFICIENT: {
    userMessage: 'Rezerve edilen tutar yetersiz. Bekleyen emirleriniz tutar limitini asmis olabilir.',
    recoverable: false,
    action: 'check_position',
  },
};

// Hata mesajindan ErrorCode tespit et
export function detectErrorCode(errorMessage: string): ErrorCode {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('403') || msg.includes('denied') || msg.includes('access')) return 'EXTERNAL_API_DENIED';
  if (msg.includes('429') || msg.includes('rate limit')) return 'EXTERNAL_API_RATE_LIMIT';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'EXTERNAL_API_TIMEOUT';
  if (msg.includes('insufficient fund') || msg.includes('yetersiz bakiye')) return 'INSUFFICIENT_FUNDS';
  if (msg.includes('insufficient') || msg.includes('candle') || msg.includes('no data')) return 'INSUFFICIENT_DATA';
  if (msg.includes('invalid position') || msg.includes('gecersiz pozisyon')) return 'INVALID_POSITION';
  if (msg.includes('invalid quantity') || msg.includes('gecersiz adet')) return 'INVALID_QUANTITY';
  if (msg.includes('invalid') || msg.includes('symbol')) return 'INVALID_SYMBOL';
  if (msg.includes('market closed') || msg.includes('piyasa kapali')) return 'MARKET_CLOSED';
  if (msg.includes('stale') || msg.includes('guncel degil')) return 'STALE_QUOTE';
  if (msg.includes('deviation') || msg.includes('sapma')) return 'PRICE_DEVIATION_TOO_HIGH';
  if (msg.includes('delisted') || msg.includes('cikarilmis')) return 'DELISTED_SYMBOL';
  if (msg.includes('queue') || msg.includes('full')) return 'INNGEST_QUEUE_FULL';
  return 'INTERNAL_ERROR';
}
