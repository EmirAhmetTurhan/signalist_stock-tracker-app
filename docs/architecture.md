# Mimari

> **Amaç:** Sistem mimarisi, tasarım desenleri, veri akışları ve kritik mimari kararlar.
> **Kapsam:** Tarayıcıdan veritabanına tüm katmanlar — auth, arkaplan işleri ve dış API'ler dahil.
> **Ayrıca bakınız:** [[frontend]], [[backend]], [[database]], [[technical-analysis]]
> **Son güncelleme:** 2026-05-22 (4-faz refactoring: bileşen reorganizasyonu, DB timestamps, katman ihlali, INDICATOR_REGISTRY, useChatManager)

---

## Sistem Mimarisi

```
┌──────────────┐     ┌──────────────────────────────────────────────────────┐
│   Tarayıcı    │────▶│                 Next.js Sunucusu                      │
│   (İstemci)   │     │                                                      │
└──────────────┘     │  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │
                     │  │ App Router  │  │  Server  │  │  API Routes   │  │
                     │  │ (sayfalar)  │  │  Actions │  │  (Inngest +   │  │
                     │  │ + AI Agent) │  │          │  │   AI Chat)    │  │
                     │  └─────────────┘  └──────────┘  └───────────────┘  │
                     │         │               │               │           │
                     └─────────┼───────────────┼───────────────┼───────────┘
                               │               │               │
          ┌────────────────────┼───────────────┼───────────────┼──────────┐
          │                    ▼               ▼               ▼          │
          │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
          │  │ MongoDB  │  │ Finnhub  │  │  Gemini  │  │  Gmail   │     │
          │  │ (veri)   │  │ (hisse)  │  │   (AI)   │  │  SMTP    │     │
          │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
          │                                                              │
          │  ┌──────────┐  ┌──────────┐                                 │
          │  │ Inngest  │  │  Yahoo   │                                 │
          │  │  Cloud   │  │ Finance  │  (fallback)                     │
          │  └──────────┘  └──────────┘                                 │
          └─────────────────────────────────────────────────────────────┘
```

---

## Tasarım Desenleri

| Desen | Konum | Detay |
|--------|------|-------|
| **Singleton** | `database/mongoose.ts` | Global önbellekli Mongoose bağlantısı, hot reload'da bağlantı fırtınasını önler |
| **Singleton** | `lib/better-auth/auth.ts` | Top-level await ile tek Better Auth instance'ı (`export const auth = await getAuth()`) |
| **Server Actions** | `lib/actions/*.ts` | Tüm veri mutasyonları `'use server'` direktifi kullanır; client bileşenlerden çağrılır |
| **Repository-benzeri** | `lib/actions/` | Actions katmanı, veritabanı erişimini dışa aktarılan fonksiyonlar arkasında soyutlar |
| **Server Components (varsayılan)** | `app/` | Çoğu sayfa server component'tir; yalnızca formlar ve etkileşimli widget'lar client component'tir |
| **Cache-first** | `lib/actions/finnhub.actions.ts` | Finnhub çağrıları Next.js `fetch`'i `cache: 'force-cache'` ve `revalidate` aralıklarıyla sarmalar |
| **Round-robin** | `lib/actions/finnhub.actions.ts → getNews()` | Her sembolden sırayla birer makale toplar, maksimum 6 |
| **Fallback zinciri** | `lib/actions/finnhub.actions.ts` | Mumlar: Finnhub → Yahoo Finance; Haberler: izleme listesi → genel piyasa |
| **Pure Functions** | `lib/indicators/*.ts` | Tüm indikatör hesaplamaları yan etkisiz, saf matematiksel fonksiyonlardır |
| **Service Layer** | `lib/ta/` | İndikatör hesaplama (`compute.ts`), sinyal üretimi (`signals.ts`), backtest (`backtest.ts`), optimizasyon (`optimizer.ts`) — hem TA sayfası hem de AI Agent tarafından kullanılan paylaşımlı çekirdek |
| **Lazy Computation** | `lib/ta/compute.ts` | `computeIndicators()` yalnızca `activeIndicators` Set'inde olan indikatörleri hesaplar |
| **Component Registry** | `components/ai/registry.tsx` | Her tool ismi → React bileşeni eşlemesi. Yeni tool eklemek 1 satır. `getAllToolResults()` ile normalize edilmiş veri → `TOOL_COMPONENT_MAP` lookup → dinamik kart render |
| **Reasoning Pipeline** | `lib/inngest/functions.ts` | Inngest her step'te `steps[]` dizisine ilerleme yazar. Client 1.5sn polling ile `ReasoningChain` bileşeninde canlı adımları gösterir |
| **Graceful Error Handling** | `lib/ai/error-codes.ts` + `components/ai/ErrorCard.tsx` | 8 standart hata kodu (`EXTERNAL_API_DENIED`, `RATE_LIMIT`, `TIMEOUT`, vb.). `toToolError()` → `userMessage` + `errorCode` + `recoverable`. Client'ta `ErrorCard` — actionable (Retry, Check API Status, Search Stocks) |
| **Smart Title Generation** | `app/api/chat/route.ts` | İlk mesajda `generateText()` ile paralel LLM çağrısı → 3 kelimelik borsa başlığı → `updateConversationTitle()` |
| **Optimistic UI** | `store/useAppStore.ts` | Zustand global state: `watchlist` (anında ekleme/çıkarma), `activeJobs` (sidebar spinner), `activeIndicators` (AI→TA geçiş) |
| **Sliding Window Context** | `app/api/chat/route.ts` | `messages.slice(-10)` — AI başına 10 mesajla sınırlanır, token şişmesi engellenir |
| **Tool Calling** | `app/api/chat/route.ts` | `stopWhen: stepCountIs(5)` — `maxSteps` AI SDK v6'da YOKTUR. `// @ts-ignore` ile gizlenen bu hata tool islemlerinin basarisiz olmasinin kok nedeniydi.
| **DB Persistence Decoupling** | `app/api/chat/route.ts` | `result.response` promise'i ile DB kaydi HTTP stream'den bagimsiz — client disconnect olsa bile mesajlar kaydedilir |
| **Shared Chat Hook** | `hooks/useChatManager.ts` | AI sayfası ve FloatingChatButton için paylaşımlı `useChat` mantığı — transport, hydration, stale timer, lazy creation, auto-scroll |
| **Indicator Registry** | `lib/constants/indicators.ts` | Tüm 17 indikatörün tek kaynak sabiti — prompt, optimizer ve tools buradan beslenir |
| **Resilience Layer (6 katman)** | `hooks/useChatManager.ts` + `app/api/chat/route.ts` | (1) Polling loop (3sn'de bir, 60sn timeout), (2) onError toast bildirimi, (3) Network offline/online detection, (4) Double submit lock (pendingRef), (5) Server error classification (ECONNREFUSED, timeout, rate limit), (6) Stable roomKey (stream survives conversation switch) |
| **Test Infrastructure** | `vitest.config.ts` + `*.test.ts` | Vitest v4 — 41 test (Zod validasyon, RSI hesaplama, backtest motoru, hata kodları), `npm test` ile çalışır |

---

## Auth Akışı

```
1. Kullanıcı /sign-in veya /sign-up sayfasına kimlik bilgilerini POST eder
2. İstemci Server Action'ı çağırır (signInWithEmail / signUpWithEmail)
3. Server Action, Better Auth API'sini çağırır (signInEmail / signUpEmail)
4. Better Auth kullanıcıyı MongoDB 'user' koleksiyonuna kaydeder
5. Kayıt sırasında: Inngest 'app/user.created' event'i tetiklenir
   → Gemini kişiselleştirilmiş hoşgeldin metni üretir
   → Nodemailer hoşgeldin e-postası gönderir
6. Better Auth tarayıcıya session cookie yerleştirir
7. middleware/index.ts korunan route'larda session cookie'yi kontrol eder
   → Cookie yok: /sign-in sayfasına yönlendir
   → Cookie var: devam et
8. (root)/layout.tsx auth.api.getSession() ile session'ı ikinci kez kontrol eder
   → Geçerli session yok: /sign-in sayfasına yönlendir
```

### Auth Route Grupları

- `(auth)/` — Oturum açmamış kullanıcılar için. `layout.tsx` session varsa `/` adresine yönlendirir.
- `(root)/` — Oturum açmış kullanıcılar için. `layout.tsx` session yoksa `/sign-in` adresine yönlendirir.

---

## TA Sayfası Veri Akışı

Teknik Analiz sayfası (`app/(root)/ta/page.tsx`) en karmaşık sistemdir — 914 satır, server component:

```
1. URL Query Parametreleri → symbol, interval (1d/4h), ind (virgülle ayrılmış indikatörler),
                              strategy, indikatör başına parametreler

2. searchStocks()          → Arama komut paleti için başlangıç hisse listesi

3. getDailyCandles()       → Finnhub /stock/candle → Yahoo /v8/finance/chart (fallback)
   veya get4HourCandles()  → 2 yıldan eski: günlük barlardan sentetik 4H
                           → Son 2 yıl: 1H Yahoo verisinden 4H bucket'lara birleştirilir

4. İndikatör Hesaplama     → `lib/ta/compute.ts` → `computeIndicators()` — sadece seçili indikatörler

5. Sinyal Üretimi          → `lib/ta/signals.ts` → `generateAllSignals()` — STRONG BUY / WEAK BUY /
                              NEUTRAL / WEAK SELL / STRONG SELL

6. Genel Skor              → `computeOverall()` — ağırlıklı ortalama: STRONG BUY=+2, WEAK BUY=+1,
                              WEAK SELL=-1, STRONG SELL=-2
                              ≥1.5→STRONG BUY, ≥0.5→WEAK BUY,
                              ≤-1.5→STRONG SELL, ≤-0.5→WEAK SELL, diğer→NEUTRAL

7. Opsiyonel Hesaplamalar  → Mum formasyonları, tarihsel fraktallar, destek/direnç

8. İstemci Render'ı        → LightweightCandleChart + bireysel indikatör grafikleri
```

**Önemli:** TA sayfası bir Server Component'tir (`'use client'` direktifi yoktur). Tüm indikatör hesaplamaları ve sinyal üretimi sunucu tarafında yapılır. Hesaplanan veriler client component'lara (chart bileşenleri) props olarak iletilir. Bu, client bundle'ını küçük tutar ve veri işleme performansını artırır.

---

## Inngest İş Akışları

`lib/inngest/functions.ts` içinde tanımlıdır. Dört fonksiyon:

### 1. sendSignUpEmail (event-driven)
- **Tetikleyici:** `app/user.created` event'i (`signUpWithEmail` içinden ateşlenir)
- **Adımlar:**
  1. Gemini AI ile kişiselleştirilmiş hoşgeldin metni üret (`gemini-2.5-flash-lite`)
  2. Nodemailer ile hoşgeldin e-postası gönder

### 2. sendDailyNewsSummary (cron + event)
- **Zamanlama:** `0 12 * * *` (her gün 12:00 UTC) + `app/send.daily.news` event'i
- **Adımlar:**
  1. MongoDB'den tüm kullanıcıları getir
  2. Her kullanıcı için: izleme listesi sembollerini al → Finnhub'dan haberleri çek
  3. Gemini AI ile haberleri özetle (kullanıcı başına)
  4. Nodemailer ile HTML e-posta gönder

### 3. evaluateDailyPriceAlerts (cron + event)
- **Zamanlama:** `0 12 * * *` (her gün 12:00 UTC) + `app/evaluate.price.alerts` event'i
- **Adımlar:**
  1. MongoDB'den aktif günlük alarmları yükle
  2. Sembole göre grupla, Finnhub'dan güncel fiyatı çek
  3. Her alarmı eşik değerine göre değerlendir
  4. Koşul sağlanıyorsa ve bugün henüz bildirilmediyse alarm e-postası gönder
  5. `lastNotifiedOn` alanını güncelle (günde bir kere sınırı)

### 4. aiOptimizeParameter (event-driven) — 2026-05-21
- **Tetikleyici:** `ai/optimize-parameter` event'i (AI `optimizeParameter` tool'u içinden ateşlenir)
- **Adımlar (Reasoning Pipeline — 4 adım canlı izleme):**
  1. `create-report` → Report oluştur (`status: 'processing'`, `steps[0]: completed`)
  2. `run-optimization` → Mum verisi çekme + `findBestParameter()` brute-force optimizasyon
     - Step 1: `fetch-candles` (`status: 'running'` → `completed`: "Fetched N candles")
     - Step 2: `run-optimization` (`status: 'running'` → `completed`: "Computing RSI for 38 parameters...")
     - Step 3: `finalize` (`status: 'running'` → `completed`: "Best 14: 65.5% win rate")
  3. `update-report` → Report'u `status: 'completed'` + `bestValue` + `winRate` + `fullData` ile güncelle
  4. Hata durumunda: `mark-failed` → `status: 'failed'` + `errorMessage` (kullanıcı dostu) + `steps[]` hata adımı
- **Client:** LiveAnalysisCard 1.5 saniye polling ile `steps[]` dizisini canlı `ReasoningChain` olarak render eder

> **Not:** `evaluateDailyPriceAlerts` içinde quote API çağrısı `revalidate: 60` ile yapılır (1 dakikalık önbellek), diğer Finnhub çağrılarından farklı olarak.

---

## Kritik Mimari Kararlar

| Karar | Gerekçe |
|-------|---------|
| **Server Components varsayılan** | Daha iyi performans, daha küçük client bundle, veri çekme render ile aynı yerde |
| **Standart grafikler için TradingView widget** | Render karmaşıklığını dışarı taşır, ücretsiz, iyi bakımlı |
| **Özel indikatörler için lightweight-charts** | Mum grafikler üzerinde indikatör overlay'i yapılabilir, tam TradingView'den daha hafif |
| **MongoDB (SQL değil)** | Gelişen indikatör parametreleri için esnek şema, daha basit kurulum |
| **Inngest (Vercel Cron değil)** | Platform bağımsız, built-in AI plugin (Gemini), adım bazlı dayanıklılık |
| **Better Auth için top-level await** | Better Auth'ün Next.js entegrasyonu tarafından zorunlu kılınır |
| **Yahoo Finance fallback** | Finnhub ücretsiz tier intraday veri sağlamaz; Yahoo 1H veriyi 4H'a birleştirmek için kullanılır |
| **Günlük barlardan sentetik 4H** | 2 yıllık kesme sınırında indikatör sürekliliği için gerekli — sabit bar frekansını korur |
| **API Route yerine Server Actions** | Daha az boilerplate, tip güvenliği, client'tan doğrudan çağrılabilir |
| **Error Boundary ile graceful degradation** | TA sayfasındaki chart alanı `ErrorBoundary` ile sarılı — tek bir chart çökmesi tüm sayfayı etkilemez |
| **Zod input validasyonu** | Tüm kullanıcı girdileri Zod şemalarıyla doğrulanır; aynı şemalar AI Agent tool tanımlarında kullanılır |
| **AI Agent (Vercel AI SDK v6 + Ollama)** | Qwen 3 14B modeli ile 14 tool üzerinden gerçek zamanlı finansal analiz. `lib/ai/` modülü, `/api/chat` endpoint'i, `/ai` tam sayfa ve floating overlay UI |
