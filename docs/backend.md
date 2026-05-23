# Backend

> **Amaç:** Server Actions, iş mantığı, dış API entegrasyonları, arkaplan işleri ve e-posta sistemi.
> **Kapsam:** `lib/actions/`, `lib/inngest/`, `lib/nodemailer/`, `lib/ai/`, `lib/ta/` altındaki tüm dosyalar ve yardımcı modüller.
> **Ayrıca bakınız:** [[architecture]], [[database]], [[technical-analysis]], [[deployment-env]], [[ai-agent-architecture]]
> **Son güncelleme:** 2026-05-22 (6 katmanlı resilience + server error classification + test altyapısı)

---

## Server Actions (`lib/actions/`)

Tüm dosyalar `'use server'` direktifini kullanır. Her fonksiyon client bileşenlerden çağrılabilir bir RPC gibidir.
Hata yönetimi deseni: tüm fonksiyonlar try-catch ile sarılır, başarısızlıkta `{ success: false, error: string }` döner.

### auth.actions.ts

> **Güncelleme 2026-05-21:** Zod validasyonu (`lib/validations/schemas.ts`) ve yapılandırılmış hata loglaması (`[Auth]` prefix, `console.error`) eklendi.

| Fonksiyon | Amaç |
|-----------|------|
| `signUpWithEmail(input)` | Zod `signUpSchema` ile doğrular, Better Auth ile kullanıcı kaydeder, `app/user.created` Inngest event'ini ateşler |
| `signInWithEmail(input)` | Zod `signInSchema` ile doğrular, Better Auth `signInEmail` ile kullanıcıyı doğrular |
| `signOut()` | Better Auth `signOut` ile oturumu sonlandırır |
| `updateProfile({name, image})` | Better Auth `updateUser` ile kullanıcı profilini günceller |

### finnhub.actions.ts (20KB)

> **Güncelleme 2026-05-21:** API anahtarı `FINNHUB_API_KEY` olarak değiştirildi (önceden `NEXT_PUBLIC_FINNHUB_API_KEY`). `NEXT_PUBLIC_` prefix'i kaldırıldığı için anahtar artık client bundle'a gömülmez.

| Fonksiyon | Amaç |
|-----------|------|
| `fetchJSON<T>(url, revalidateSeconds?)` | Genel önbellekli fetch sarmalayıcı. `revalidateSeconds` verilirse `cache: 'force-cache'` + `next: { revalidate }`, verilmezse `cache: 'no-store'` kullanır. |
| `getNews(symbols?)` | Şirkete özel veya genel piyasa haberlerini getirir. Semboller arasında round-robin seçim, maksimum 6 makale. |
| `searchStocks(query?)` | Finnhub `/search` veya sorgu yoksa popüler semboller listesi ile hisse arama. `StockWithWatchlistStatus[]` döner. React `cache()` ile tekilleştirilir. |
| `getDailyCandles(symbol, days)` | OHLC mumları. Önce Finnhub `/stock/candle` dener, başarısızsa Yahoo Finance `/v8/finance/chart` fallback. Her veri noktasını doğrular (null reddi, low≤high kontrolü). |
| `get4HourCandles(symbol, days)` | 4H mumları. 720 günden eski veriler için: günlük mumlardan sentetik 4H barlar oluşturur (günde 2 bar). Son 2 yıl için: Yahoo 1H verisini çeker, 4H bucket'lara birleştirir. Kronolojik olarak çakışmasız birleştirir. |

**Kullanılan Finnhub endpoint'leri:**
- `/search?q=...` — Hisse arama
- `/stock/candle?symbol=...&resolution=D...` — Günlük OHLC
- `/stock/profile2?symbol=...` — Şirket profili, logo, borsa
- `/quote?symbol=...` — Canlı fiyat
- `/company-news?symbol=...` — Şirkete özel haberler
- `/news?category=general` — Genel piyasa haberleri

**Kullanılan Yahoo Finance endpoint'i:**
- `/v8/finance/chart/{symbol}?interval=1d...` — Günlük mumlar (fallback)
- `/v8/finance/chart/{symbol}?interval=1h...` — 1H mumları (4H birleştirme için)

**Önbellek Konfigürasyonu:**

| Veri Tipi | Revalidate | Cache Stratejisi |
|-----------|-----------|------------------|
| Haberler (`getNews`) | 300s | `force-cache` |
| Arama (`searchStocks`) | 1800s | `force-cache` |
| Şirket profilleri | 3600s | `force-cache` |
| Günlük mumlar | 600s | `force-cache` (Finnhub + Yahoo) |
| Canlı fiyat (alert) | 60s | `force-cache` |

### watchlist.actions.ts

| Fonksiyon | Amaç |
|-----------|------|
| `getCurrentUserWatchlist()` | Kullanıcının izleme listesini `addedAt` azalan sırada döner. Fiyat/piyasa değeri/FK gibi canlı verilerle zenginleştirilmiş. |
| `addToWatchlist(symbol, company)` | Hisse ekler. Duplicate key hataları sessizce başarıya dönüşür (`{ ok: true, added: true }`). |
| `removeFromWatchlist(symbol)` | userId+symbol ile hisseyi kaldırır |
| `getWatchlistSymbolsByEmail(email)` | Better Auth `user` koleksiyonundan email ile kullanıcı bulur, izleme listesi sembollerini döner |

### alerts.actions.ts

> **Güncelleme 2026-05-21:** Zod validasyonu (`createAlertSchema`, `updateAlertSchema`) ve yapılandırılmış hata loglaması (`[Alerts]` prefix, `console.error`) eklendi.

| Fonksiyon | Amaç |
|-----------|------|
| `createPriceAlertAction(formData)` | FormData → Zod `createAlertSchema` ile doğrular → alarm oluşturur. Başarıda veya hatada `/watchlist` sayfasına yönlendirir. |
| `getUserAlerts()` | Kullanıcının aktif alarmlarını `createdAt` azalan sırada döner |
| `updateAlertThresholdAction(formData)` | FormData → Zod `updateAlertSchema` ile doğrular → alarm eşiğini günceller + `lastNotifiedOn`'u temizler. `/watchlist` sayfasına yönlendirir. |
| `deleteAlertAction(formData)` | Alarmı id ile siler. `/watchlist` sayfasına yönlendirir. |

### user.actions.ts

| Fonksiyon | Amaç |
|-----------|------|
| `getAllUsersForNewsEmail()` | Email ve isim alanı dolu tüm kullanıcıları Better Auth `user` koleksiyonundan sorgular. Günlük haber cron job'u tarafından kullanılır. |

---

## Inngest Arkaplan İşleri (`lib/inngest/`)

### client.ts
Inngest client'ını Gemini AI plugin'i ile oluşturur:
```typescript
new Inngest({
  id: 'signalist',
  ai: { gemini: { apiKey: process.env.GEMINI_API_KEY! }}
})
```

### functions.ts
Üç fonksiyon (detay için bkz. [[architecture#Inngest İş Akışları]]):

1. **`sendSignUpEmail`** — Event-tetiklemeli (`app/user.created`). Gemini hoşgeldin metni üretir, Nodemailer gönderir.
2. **`sendDailyNewsSummary`** — Cron (`0 12 * * *`) + event (`app/send.daily.news`). Kullanıcıları getir → izleme listesi → haberler → Gemini özeti → e-posta.
3. **`evaluateDailyPriceAlerts`** — Cron (`0 12 * * *`) + event (`app/evaluate.price.alerts`). Aktif alarmları güncel fiyatlarla değerlendirir, bildirim gönderir.

### prompts.ts
İki AI prompt şablonu (+ bir kullanılmayan yedek):
- `PERSONALIZED_WELCOME_EMAIL_PROMPT` — `{{userProfile}}` placeholder'ı ile hoşgeldin e-postası
- `NEWS_SUMMARY_EMAIL_PROMPT` — `{{newsData}}` placeholder'ı ile haber özeti e-postası
- `TRADINGVIEW_SYMBOL_MAPPING_PROMPT` — Finnhub → TradingView sembol eşleştirme (şu anda Inngest fonksiyonlarında kullanılmıyor)

---

## Nodemailer E-posta Sistemi (`lib/nodemailer/`)

### index.ts
Gmail SMTP transporter, `NODEMAILER_EMAIL` ve `NODEMAILER_PASSWORD` env değişkenlerini kullanır.

Üç e-posta gönderici:

| Fonksiyon | Amaç |
|-----------|------|
| `sendWelcomeEmail({email, name, intro})` | HTML hoşgeldin e-postası |
| `sendNewsSummaryEmail({email, date, newsContent})` | Günlük haber özeti |
| `sendPriceAlertEmail({email, symbol, company, currentPrice, threshold, type, timestamp})` | Fiyat alarmı bildirimi (upper/lower varyantları) |

Tüm e-postalar `"Signalist" <signalist@jsmastery.pro>` adresinden gönderilir.

### templates.ts (57KB, en büyük kaynak dosyası)

**6** HTML e-posta şablonu export eder:

| # | Şablon | Placeholder'lar | Kullanımda? |
|---|--------|----------------|-------------|
| 1 | `WELCOME_EMAIL_TEMPLATE` | `{{name}}`, `{{intro}}` | ✅ `sendWelcomeEmail` |
| 2 | `NEWS_SUMMARY_EMAIL_TEMPLATE` | `{{date}}`, `{{newsContent}}` | ✅ `sendNewsSummaryEmail` |
| 3 | `STOCK_ALERT_UPPER_EMAIL_TEMPLATE` | `{{symbol}}`, `{{company}}`, `{{currentPrice}}`, `{{targetPrice}}`, `{{timestamp}}` | ✅ `sendPriceAlertEmail` (upper) |
| 4 | `STOCK_ALERT_LOWER_EMAIL_TEMPLATE` | `{{symbol}}`, `{{company}}`, `{{currentPrice}}`, `{{targetPrice}}`, `{{timestamp}}` | ✅ `sendPriceAlertEmail` (lower) |
| 5 | `VOLUME_ALERT_EMAIL_TEMPLATE` | — | ❌ Henüz kullanılmıyor |
| 6 | `INACTIVE_USER_REMINDER_EMAIL_TEMPLATE` | — | ❌ Henüz kullanılmıyor |

Tüm şablonlar dark mode responsive tasarıma sahiptir. Görseller ImageKit üzerinden servis edilir: `https://ik.imagekit.io/a6fkjou7d/`

> **Not:** `VOLUME_ALERT_EMAIL_TEMPLATE` ve `INACTIVE_USER_REMINDER_EMAIL_TEMPLATE` kodda tanımlıdır ancak `index.ts` tarafından import edilmez ve hiçbir Inngest fonksiyonu tarafından kullanılmaz. Gelecek özellikler için hazırlanmış şablonlardır.

---

## AI Agent (`lib/ai/`) — 2026-05-21 (Agentic UI Dönüşümü)

Gerçek zamanlı finansal analiz asistanı. Qwen 3 14B (Ollama) + Vercel AI SDK v6 (`ai@^6.0.185` + `@ai-sdk/react@^3.0.187`).

### tools.ts (18 tool) — 5 Savunma Hattı + Actions Layer

`tool()` fonksiyonu ile tanımlanmış, Zod schema + execute fonksiyonundan oluşan araç seti.
**Tüm DB erişimi Actions katmanı üzerinden yapılır** — doğrudan model import'u kaldırıldı (2026-05-22).

**5 savunma hattı:**
1. **Strict Zod:** `requiredSymbol` şeması — AI'a "sembol yoksa tool'u çağırma"
2. **Try-Catch:** Tüm 18 tool hata yakalar
3. **Timeout:** `withTimeout()` — veri çekme 15sn, ağır işlem 25sn
4. **Event-Loop Yield:** `yieldToMain()` — CPU-bound işlemler öncesi nefes alma

**5. İnsancıl Hata Yönetimi (yeni — 2026-05-21):**
`toToolError(e, symbol?)` yardımcısı — ham hatayı analiz eder, 6 hata desenini tespit eder (403, 429, timeout, insufficient data, invalid symbol, internal), `{ success: false, errorCode, userMessage, recoverable }` formatında zenginleştirilmiş hata döndürür.

**Tool listesi (Router Agent kategorili):**
- **[SYSTEM] (1):** `askClarification` — eksik bilgi toplama (stopWhen ile anında durur)
- **[TA_TOOLS] (2):** `analyzeIndicators`, `getCurrentPrice`
- **[RESEARCH_TOOLS] (6):** `runBacktest`, `optimizeParameter` (Inngest), `batchOptimizeParameter` (toplu, Inngest), `rankIndicators` (Inngest), `findBestIndicator` (Inngest), `getMarketNews`
- **[USER_TOOLS] (8):** `getWatchlist`, `addToWatchlist`, `removeFromWatchlist`, `createPriceAlert`, `deletePriceAlert`, `getUserAlerts`, `createSmartAlert`, `getSmartAlerts`
  - USER_TOOLS artık `lib/actions/alerts.actions.ts` (`createAlert`, `deleteAlert`) ve `lib/actions/smart-alerts.actions.ts` üzerinden DB'ye erişir. Doğrudan model import'u kaldırıldı.
- **[SEARCH] (1):** `searchStock`

### error-codes.ts (yeni — 2026-05-21)
8 standart hata kodu (`EXTERNAL_API_DENIED`, `EXTERNAL_API_RATE_LIMIT`, `EXTERNAL_API_TIMEOUT`, `INSUFFICIENT_DATA`, `INVALID_SYMBOL`, `OPTIMIZATION_FAILED`, `INNGEST_QUEUE_FULL`, `INTERNAL_ERROR`). Her kod için: `userMessage` (kullanıcı dostu), `recoverable` (tekrar denenebilir mi?), `action` (retry/check_api/try_different_symbol). `detectErrorCode(errorMessage)` — otomatik tespit.

### tool-parser.ts (yeni — 2026-05-21)
Tool sonuçlarını normalize eden parser. `getAllToolResults(message)` — AI SDK v6 (`tool-invocation`) ve v4/v5 (`tool-call`/`tool-result`) formatlarını tek `NormalizedToolResult` tipine çevirir. `getFailedToolResults()`, `getSuccessfulToolResults()`, `isOptimizeParamCall()`, `hasOptimizeParamResult()` yardımcıları.

### prompts.ts
System prompt: finans-only guardrail, Router Agent TOOL CATEGORIES ([SYSTEM_TOOLS]/[TA_TOOLS]/[RESEARCH_TOOLS]/[USER_TOOLS]/[SEARCH]), yatırım tavsiyesi vermeme kuralı, `INDICATOR_NAMES_STRING` sabiti ile dinamik indikatör listesi.

### API Route (`app/api/chat/route.ts`)
`POST` endpoint. `streamText()` + `generateText()` (smart title) ile streaming yanıt.

**2026-05-22 Resilience güncellemeleri:**
- **Server error classification:** ECONNREFUSED → "Ollama çalışmıyor", timeout → "Model aşırı yüklendi", rate limit → 429 + "Çok fazla istek"
- **DB Persistence decoupling:** `result.response` promise'i HTTP stream'den bağımsız — client disconnect olsa bile LLM yanıtı DB'ye kaydedilir
- **stopWhen:** `hasToolCall('askClarification')` — AI eksik bilgi istediğinde stream anında durur

**2026-05-22 güncellemeleri:**
- **`stopWhen: stepCountIs(5)`:** `maxSteps` AI SDK v6\'da mevcut degildir. `// @ts-ignore` ile gizlenen bu hata SDK\'nin `stepCountIs(1)` varsayilanini kullanmasina neden oluyordu. Bu, tool-calling islemlerinin basarisiz olmasinin KOK NEDENIYDI.
- **onFinish + result.response:** Cift DB kayit mekanizmasi
- **Dinamik model secimi:** `resolveModel()` — Ollama, Groq, OpenRouter, kullanici API key desteklenir
- **Auth kontrolu:** Try-catch + 401

**2026-05-21 güncellemeleri:**
- **Smart Title:** İlk mesajda `generateText()` ile paralel LLM çağrısı → 3 kelimelik borsa başlığı
- **Sliding Window:** `messages.slice(-10)` — token şişmesi engellenir
- `maxSteps: 5` + `convertToModelMessages()` + `toUIMessageStreamResponse()`

### report.actions.ts (yeni — 2026-05-21)
`getReportByJobId(jobId)` — Inngest arka plan işlem raporunu sorgular. Dönüş: `{ status, bestValue, winRate, errorMessage, steps[], fullData }`. LiveAnalysisCard tarafından 1.5 saniye polling ile kullanılır.

---

## Yardımcı Modüller

### utils.ts
Genel amaçlı yardımcılar: `cn()` (Tailwind class birleştirme), `formatTimeAgo()`, `formatMarketCapValue()` (T/B/M son ekleri), `getDateRange()`, `getTodayDateRange()`, `calculateNewsDistribution()`, `validateArticle()`, `formatArticle()`, `formatChangePercent()`, `getChangeColorClass()`, `formatPrice()`, `getAlertText()`, `getFormattedTodayDate()`.

### constants/ (domain bazlı bölündü, 2026-05-21)
- `lib/constants/index.ts` (58 satır) — `NAV_ITEMS`, form seçenekleri + barrel re-export
- `lib/constants/widgets.ts` (226 satır) — 10 TradingView widget konfigürasyonu ve fabrika fonksiyonu
- `lib/constants/stocks.ts` (21 satır) — `POPULAR_STOCK_SYMBOLS` (50 hisse), `WATCHLIST_TABLE_HEADER`, `NO_MARKET_NEWS`

### validations/schemas.ts (✨ yeni, 2026-05-21)
Zod şemaları ve `validate<T>()` generic yardımcı:
- `signInSchema`, `signUpSchema` — auth form validasyonu
- `createAlertSchema`, `updateAlertSchema` — alarm form validasyonu
- `stockSymbolSchema` — hisse sembolü format kontrolü (1-10 karakter, otomatik uppercase)
- `indicatorAnalysisRequestSchema` — AI Agent için hazır (sembol, interval, indikatör listesi)
- `validate<T>(schema, input)` — `{ success, data } | { success, error }` döner
