# Backend

> **Amaç:** Server Actions, iş mantığı, dış API entegrasyonları, arkaplan işleri ve e-posta sistemi.
> **Kapsam:** `lib/actions/`, `lib/inngest/`, `lib/nodemailer/`, `lib/ai/`, `lib/ta/` altındaki tüm dosyalar ve yardımcı modüller.
> **Ayrıca bakınız:** [[architecture]], [[database]], [[technical-analysis]], [[deployment-env]], [[ai-agent-architecture]]
> **Son güncelleme:** 2026-05-25 (tam asenkron polling, 7 Inngest fonksiyonu, CanonicalMessage, tool-contracts, multi-provider)

---

## Server Actions (`lib/actions/`)

Tüm dosyalar `'use server'` direktifini kullanır. Her fonksiyon client bileşenlerden çağrılabilir bir RPC gibidir.
Hata yönetimi deseni: tüm fonksiyonlar try-catch ile sarılır, başarısızlıkta `{ success: false, error: string }` döner.

### auth.actions.ts

| Fonksiyon | Amaç |
|-----------|------|
| `signUpWithEmail(input)` | Zod `signUpSchema` ile doğrular, Better Auth ile kullanıcı kaydeder, `app/user.created` Inngest event'ini ateşler |
| `signInWithEmail(input)` | Zod `signInSchema` ile doğrular, Better Auth `signInEmail` ile kullanıcıyı doğrular |
| `signOut()` | Better Auth `signOut` ile oturumu sonlandırır |
| `updateProfile({name, image})` | Better Auth `updateUser` ile kullanıcı profilini günceller |

### finnhub.actions.ts (20KB)

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

| Fonksiyon | Amaç |
|-----------|------|
| `createAlert(input)` | Zod validasyonlu alarm oluşturma. AI tool'lar tarafından da programatik olarak çağrılabilir |
| `deleteAlert(symbol)` | Sembole göre alarm silme. AI tool'lar tarafından da kullanılır |
| `getUserAlerts()` | Kullanıcının aktif alarmlarını `createdAt` azalan sırada döner |

### chat-history.actions.ts

| Fonksiyon | Amaç |
|-----------|------|
| `createConversation(title)` | Yeni konuşma oluşturur. İlk mesajda lazy creation ile çağrılır |
| `getUserConversations()` | Kullanıcının son 50 konuşmasını `updatedAt` azalan sırada döner |
| `getConversationMessages(id)` | Bir konuşmanın tüm mesajlarını `createdAt` artan sırada döner |
| `saveMessage(convId, role, parts, userId?)` | AI SDK parts formatında mesaj kaydeder |
| `updateConversationTitle(id, title)` | Smart title için — AI tarafından üretilen başlığı günceller |
| `togglePinConversation(id)` | Konuşmayı sabitler/sabiti kaldırır |
| `deleteConversation(id)` | Konuşmayı ve tüm mesajlarını siler |

### ai-job.actions.ts

| Fonksiyon | Amaç |
|-----------|------|
| `getActiveJobs()` | Kullanıcının running/queued durumundaki işlerini döner |
| `getJobByJobId(jobId)` | Tek bir işi jobId ile sorgular (polling için) |
| `getAllJobs()` | Kullanıcının tüm işlerini döner |
| `deleteJob(id)` | İşi siler |

### user.actions.ts

| Fonksiyon | Amaç |
|-----------|------|
| `getAllUsersForNewsEmail()` | Email ve isim alanı dolu tüm kullanıcıları Better Auth `user` koleksiyonundan sorgular |

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

### Toplam 7 Fonksiyon (detay için bkz. [[architecture#Inngest İş Akışları]]):

1. **`sendSignUpEmail`** — Event-tetiklemeli (`app/user.created`). Gemini hoşgeldin metni üretir, Nodemailer gönderir.
2. **`sendDailyNewsSummary`** — Cron (`0 12 * * *`) + event (`app/send.daily.news`). Kullanıcıları getir → izleme listesi → haberler → Gemini özeti → e-posta.
3. **`evaluateDailyPriceAlerts`** — Cron (`0 12 * * *`) + event (`app/evaluate.price.alerts`). Aktif alarmları güncel fiyatlarla değerlendirir, bildirim gönderir.
4. **`evaluateSmartAlerts`** — Smart strateji alarmlarını indikatör koşullarına göre değerlendirir.
5. **`aiOptimizeParameter`** — Event-tetiklemeli (`ai/optimize-parameter`). Brute-force parametre optimizasyonu + AIJob + Report + Notification. `batchId` ile toplu işlem desteği.
6. **`aiRankIndicatorsJob`** — Event-tetiklemeli (`ai/rank-indicators`). Çoklu indikatör backtest + sıralama + Report + Notification. `isSingle` flag'i.
7. **`aiProcessChatMessage`** — Event-tetiklemeli (`ai/process-chat-message`). **Ana AI fonksiyonu.** `lib/inngest/chat-async.ts` içinde. `generateText()` + `maxSteps: 5` + `onStepFinish` DB güncellemeleri + sonuç mesajlarını kaydetme.

### prompts.ts
İki AI prompt şablonu:
- `PERSONALIZED_WELCOME_EMAIL_PROMPT` — `{{userProfile}}` placeholder'ı ile hoşgeldin e-postası
- `NEWS_SUMMARY_EMAIL_PROMPT` — `{{newsData}}` placeholder'ı ile haber özeti e-postası

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

### templates.ts (57KB)

**6** HTML e-posta şablonu:

| # | Şablon | Kullanımda? |
|---|--------|-------------|
| 1 | `WELCOME_EMAIL_TEMPLATE` | ✅ `sendWelcomeEmail` |
| 2 | `NEWS_SUMMARY_EMAIL_TEMPLATE` | ✅ `sendNewsSummaryEmail` |
| 3 | `STOCK_ALERT_UPPER_EMAIL_TEMPLATE` | ✅ `sendPriceAlertEmail` (upper) |
| 4 | `STOCK_ALERT_LOWER_EMAIL_TEMPLATE` | ✅ `sendPriceAlertEmail` (lower) |
| 5 | `VOLUME_ALERT_EMAIL_TEMPLATE` | ❌ Gelecek özellik |
| 6 | `INACTIVE_USER_REMINDER_EMAIL_TEMPLATE` | ❌ Gelecek özellik |

Tüm şablonlar dark mode responsive tasarıma sahiptir. Görseller ImageKit üzerinden servis edilir.

---

## AI Agent (`lib/ai/`) — 2026-05-25 (Tam Asenkron Polling)

Gerçek zamanlı finansal analiz asistanı. Qwen 3 14B (Ollama) + Vercel AI SDK v6 (`ai@^6.0.185` + `@ai-sdk/react@^3.0.187`).
Multi-provider destekli: Ollama (lokal), Groq (cloud), OpenRouter (cloud), kullanıcı kendi API key'i.

### tools.ts (18 tool) — 5 Savunma Hattı + Router Agent Kategorileri

`tool()` fonksiyonu ile tanımlanmış, Zod schema + execute fonksiyonundan oluşan araç seti.
**Tüm DB erişimi Actions katmanı üzerinden yapılır** — doğrudan model import'u yok.

**5 savunma hattı:**
1. **Strict Zod:** `requiredSymbol` şeması — AI'a "sembol yoksa tool'u çağırma"
2. **Try-Catch:** Tüm 18 tool hata yakalar
3. **Timeout:** `withTimeout()` — veri çekme 15sn, ağır işlem 25sn
4. **Event-Loop Yield:** `yieldToMain()` — CPU-bound işlemler öncesi nefes alma
5. **İnsancıl Hata:** `toToolError()` — 6 hata deseni otomatik tespit (403, 429, timeout, insufficient data, invalid symbol, internal) → `{ errorCode, userMessage, recoverable }`

**Tool listesi (Router Agent kategorili):**
- **[SYSTEM] (1):** `askClarification` — eksik bilgi toplama, `stopWhen` ile anında durur
- **[TA_TOOLS] (2):** `analyzeIndicators`, `getCurrentPrice`
- **[RESEARCH_TOOLS] (6):** `runBacktest`, `optimizeParameter` (Inngest), `batchOptimizeParameter` (toplu, Inngest), `rankIndicators` (Inngest), `findBestIndicator` (Inngest), `getMarketNews`
- **[USER_TOOLS] (8):** `getWatchlist`, `addToWatchlist`, `removeFromWatchlist`, `createPriceAlert`, `deletePriceAlert`, `getUserAlerts`, `createSmartAlert`, `getSmartAlerts`
- **[SEARCH] (1):** `searchStock`

### message-format.ts (Canonical Message Layer)
4 farklı AI SDK formatını tek `CanonicalMessage` tipine normalize eden merkezi katman:
```typescript
type CanonicalPart =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown; isError: boolean }
  | { type: 'reasoning'; text: string };
```
`normalizeMessage()` + `toModelMessages()` ile dönüşüm.

### tool-contracts.ts
Her tool çıktısı için katı Zod şemaları. UI bileşenleri bu kontratlara bağlı:
- `AnalyzeIndicatorsOutput` — overallSignal, signals[]
- `SearchStockOutput` — results[{symbol, name, country}]
- `MarketNewsOutput` — articles[{headline, summary, source, url}]
- `AlertListOutput` — alerts[{id, symbol, alertType, threshold}]
- `BackgroundJobOutput` — isBackgroundJob, jobId, isBatchJob

### tool-parser.ts
Tool sonuçlarını normalize eden parser. `getAllToolResults(message)` — AI SDK v6 (`tool-invocation`) ve v4/v5 (`tool-call`/`tool-result`) formatlarını tek `NormalizedToolResult` tipine çevirir. `getFailedToolResults()`, `getSuccessfulToolResults()` yardımcıları.

### model-registry.ts
Model seçimi için tek kaynak:
```typescript
MODEL_CATEGORIES = [
  { key: 'ollama', title: 'Lokal Yapay Zeka', models: [
    { id: 'ollama:qwen3:14b', label: 'Qwen 3 14B', ... }
  ]}
];
```
Kullanıcı kendi API key'ini girerek Groq/OpenRouter/OpenAI modellerine erişebilir.

### error-codes.ts
8 standart hata kodu + `ERROR_MAP` (userMessage, recoverable, action). `detectErrorCode(errorMessage)` — otomatik tespit.

### prompts.ts
System prompt: finans-only guardrail, Router Agent TOOL CATEGORIES, yatırım tavsiyesi vermeme kuralı, `INDICATOR_NAMES_STRING` sabiti ile dinamik indikatör listesi.

### API Route (`app/api/chat/route.ts`) & Asenkron Motor (`lib/inngest/chat-async.ts`)

**API Route:** `POST` endpoint. **Streaming YOKTUR.** 
1. Auth kontrolü (better-auth session)
2. `resolveModel()` — prefix bazlı provider çözümleme (`ollama:` / `groq:` / `openrouter:` / `*-key:`)
3. Kullanıcı mesajını DB'ye kaydet
4. `AIJob.create({ status: 'queued', type: 'process_chat_message' })`
5. `inngest.send('ai/process-chat-message', { jobId, messages: slice(-6), selectedModel })`
6. Hemen `{ success: true, jobId }` döner

**Worker (`lib/inngest/chat-async.ts`):** 
Asıl AI beyni. 
- `resolveModel()` ile provider çözümleme
- `mapToCoreMessages()` → CanonicalMessage → AI SDK formatına dönüşüm
- `generateText({ system, messages, tools, stopWhen: stepCountIs(5) })`
- `onStepFinish` → AIJob'a step push ("Araç çağrılıyor", "Metin üretiliyor")
- Sonuç mesajlarını `saveMessage()` ile MongoDB'ye kaydet
- AIJob'u `completed` veya `failed` yap

### report.actions.ts
`getReportByJobId(jobId)` — Inngest arka plan işlem raporunu sorgular. Dönüş: `{ status, bestValue, winRate, errorMessage, steps[], fullData }`. LiveAnalysisCard tarafından 1.5 saniye polling ile kullanılır.

---

## Yardımcı Modüller

### utils.ts
Genel amaçlı yardımcılar: `cn()` (Tailwind class birleştirme), `formatTimeAgo()`, `formatMarketCapValue()` (T/B/M son ekleri), `getDateRange()`, `getTodayDateRange()`, `calculateNewsDistribution()`, `validateArticle()`, `formatArticle()`, `formatChangePercent()`, `getChangeColorClass()`, `formatPrice()`, `getAlertText()`, `getFormattedTodayDate()`.

### constants/
- `lib/constants/index.ts` — `NAV_ITEMS`, form seçenekleri + barrel re-export
- `lib/constants/indicators.ts` — `INDICATOR_REGISTRY` (17 indikatörün tek kaynak sabiti)
- `lib/constants/widgets.ts` — 10 TradingView widget konfigürasyonu ve fabrika fonksiyonu
- `lib/constants/stocks.ts` — `POPULAR_STOCK_SYMBOLS` (50 hisse)

### validations/schemas.ts
Zod şemaları ve `validate<T>()` generic yardımcı:
- `signInSchema`, `signUpSchema` — auth form validasyonu
- `createAlertSchema`, `updateAlertSchema` — alarm form validasyonu
- `stockSymbolSchema` — hisse sembolü format kontrolü (1-10 karakter, otomatik uppercase)
- `indicatorAnalysisRequestSchema` — AI Agent için hazır
- `validate<T>(schema, input)` — `{ success, data } | { success, error }` döner
