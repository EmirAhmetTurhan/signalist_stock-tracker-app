# Mimari

> **Amaç:** Sistem mimarisi, tasarım desenleri, veri akışları ve kritik mimari kararlar.
> **Kapsam:** Tarayıcıdan veritabanına tüm katmanlar — auth, arkaplan işleri ve dış API'ler dahil.
> **Ayrıca bakınız:** [[frontend]], [[backend]], [[database]], [[technical-analysis]]
> **Son güncelleme:** 2026-05-25 (tam asenkron polling mimarisi, CanonicalMessage formatı, multi-provider model seçimi, Component Registry)

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
                     └─────────┼───────────────┼───────────────┼───────────┘
                               │               │               │
          ┌────────────────────┼───────────────┼───────────────┼──────────┐
          │                    ▼               ▼               ▼          │
          │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
          │  │ MongoDB  │  │ Finnhub  │  │  Ollama  │  │  Gmail   │     │
          │  │ (veri)   │  │ (hisse)  │  │  (AI)    │  │  SMTP    │     │
          │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
          │                                                              │
          │  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │
          │  │ Inngest  │  │  Yahoo   │  │  Groq /  │                  │
          │  │  Cloud   │  │ Finance  │  │ OpenRouter│                  │
          │  └──────────┘  └──────────┘  └──────────┘                  │
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
| **Tool Contracts (Zod)** | `lib/ai/tool-contracts.ts` | Her tool çıktısı katı Zod şeması ile tanımlı. UI bileşenleri bu kontratlara bağlı — tip güvenliği garantisi |
| **Canonical Message Format** | `lib/ai/message-format.ts` | 4 farklı AI SDK formatını (v4/v5/v6) tek `CanonicalMessage` tipine normalize eder. `normalizeMessage()` + `toModelMessages()` ile dönüşüm |
| **Reasoning Pipeline** | `lib/inngest/functions.ts` | Inngest her step'te AIJob `steps[]` dizisine ilerleme yazar. Client 1.5sn polling ile canlı adımları gösterir |
| **Graceful Error Handling** | `lib/ai/error-codes.ts` + `components/ai/ErrorCard.tsx` | 8 standart hata kodu (`EXTERNAL_API_DENIED`, `RATE_LIMIT`, `TIMEOUT`, vb.). `toToolError()` → `userMessage` + `errorCode` + `recoverable`. Client'ta `ErrorCard` — actionable (Retry, Check API, Search Stocks) |
| **Smart Title Generation** | `app/api/chat/route.ts` | İlk mesajda `generateText()` ile paralel LLM çağrısı → 3 kelimelik borsa başlığı → `updateConversationTitle()` |
| **Optimistic UI** | `store/useAppStore.ts` | Zustand global state: `watchlist` (anında ekleme/çıkarma), `activeJobs` (convId→jobId, sidebar spinner), `activeIndicators` (AI→TA geçiş) |
| **Sliding Window Context** | `app/api/chat/route.ts` | `messages.slice(-6)` — AI bağlamı son 6 mesajla sınırlanır, token şişmesi engellenir |
| **Async Polling (Streaming YOK)** | `app/api/chat/route.ts` + `lib/inngest/chat-async.ts` | `/api/chat` sadece Inngest event'i ateşler ve `{ jobId }` döner. Asıl AI işlemi `chat-async.ts` worker'ında `generateText()` ile çalışır. Client 1.5sn polling ile jobId takip eder |
| **Multi-Provider Model** | `app/api/chat/route.ts → resolveModel()` | `ollama:qwen3:14b` / `groq:llama-3.3-70b` / `openrouter:meta-llama/...` / kullanıcı kendi API key'i. Prefix bazlı routing. Env key yoksa Ollama'ya fallback |
| **DB Persistence Decoupling** | `lib/inngest/chat-async.ts` | `result.response` promise'i ile DB kaydı Inngest asenkron işleminden bağımsızdır — client disconnect olsa bile mesajlar kaydedilir |
| **Shared Chat Hook** | `hooks/useChatManager.ts` | AI sayfası ve FloatingChatButton için paylaşımlı chat mantığı — polling, hydration, stale timer, lazy creation, auto-scroll, addToolOutput |
| **Indicator Registry** | `lib/constants/indicators.ts` | Tüm 17 indikatörün tek kaynak sabiti — prompt, optimizer ve tools buradan beslenir |
| **Resilience Layer (6 katman)** | `hooks/useChatManager.ts` + `app/api/chat/route.ts` | (1) Polling loop (1.5sn), (2) onError toast bildirimi, (3) Network offline/online detection, (4) Double submit lock (pendingRef), (5) Server error classification (ECONNREFUSED, timeout, rate limit), (6) Stable roomKey (polling survives conversation switch) |
| **Multi-Room Isolation** | `app/(root)/ai/page.tsx` | roomKey (React key) sabit kalır, convId (DB ID) değişir. Oda değişiminde unmount YOK — display flex/none ile geçiş. Stream arka planda devam eder |
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

Teknik Analiz sayfası (`app/(root)/ta/page.tsx`) en karmaşık sistemdir — 484 satır, server component:

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

## AI Agent Veri Akışı (Asenkron Polling Mimarisi)

```
1. Kullanıcı mesaj gönderir → POST /api/chat
2. Route: Auth kontrolü → kullanıcı mesajını DB'ye yaz → AIJob.create({ status: 'queued' })
3. Route: inngest.send('ai/process-chat-message', { jobId, messages.slice(-6), selectedModel })
4. Route: HEMEN { success: true, jobId } döner (AI cevabı beklenmez!)
5. Inngest Worker (chat-async.ts): resolveModel() → generateText({ system, messages, tools, stopWhen: stepCountIs(5) })
6. Worker: onStepFinish → AIJob'a step push (UI polling için)
7. Worker: Sonuç mesajlarını MongoDB'ye kaydet → AIJob'u completed/failed yap
8. Client (useChatManager): 1.5sn polling → jobId durumunu sorgula
9. Client: completed alınca → fetchMessages(convId) → DB'den tüm mesajları çek → UI güncelle
```

**Neden streaming değil de polling?** OpenRouter/Ollama gateway timeout (524) sorunları nedeniyle `streamText` terk edildi. Tam asenkron Inngest polling mimarisine geçildi. Client disconnect olsa bile AI işlemi devam eder ve sonuçlar DB'ye kaydedilir.

---

## Inngest İş Akışları

`lib/inngest/functions.ts` ve `lib/inngest/chat-async.ts` içinde tanımlıdır. Toplam 7 fonksiyon:

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

### 4. evaluateSmartAlerts (event-driven)
- **Tetikleyici:** Smart alert değerlendirme event'i
- Smart strateji alarmlarını indikatör koşullarına göre değerlendirir

### 5. aiProcessChatMessage (event-driven) — ANA AI FONKSİYONU
- **Tetikleyici:** `ai/process-chat-message` event'i (`POST /api/chat` içinden ateşlenir)
- **Konum:** `lib/inngest/chat-async.ts`
- **Adımlar:**
  1. `resolveModel()` ile provider çözümle (ollama/groq/openrouter/user-key)
  2. `generateText({ system, messages, tools, stopWhen: stepCountIs(5) })`
  3. `onStepFinish` → AIJob step güncellemeleri
  4. Sonuç mesajlarını DB'ye kaydet
  5. AIJob'u completed/failed yap

### 6. aiOptimizeParameter (event-driven)
- **Tetikleyici:** `ai/optimize-parameter` event'i (AI `optimizeParameter` / `batchOptimizeParameter` tool'u)
- **Adımlar (Reasoning Pipeline — 3 adım canlı izleme):**
  1. `create-ai-job` → AIJob oluştur (`status: 'running'`, `steps[]`)
  2. `run-optimization` → Mum verisi çekme + `findBestParameter()` brute-force optimizasyon
  3. `update-report` → Report.create + AIJob.completed + Notification.create
- **Hata:** `mark-failed` → `status: 'failed'` + kullanıcı dostu `errorMessage` + Notification

### 7. aiRankIndicatorsJob (event-driven)
- **Tetikleyici:** `ai/rank-indicators` event'i (AI `rankIndicators` / `findBestIndicator` tool'u)
- **Adımlar:**
  1. `create-ai-job` → AIJob oluştur
  2. `run-ranking` → Mum verisi + `computeIndicators()` + tüm indikatörler için `calculateWinRate()` + sırala
  3. `update-report` → Report.create + topN sonuç + Notification

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
| **Async Polling (streaming değil)** | OpenRouter 524 timeout sorunları nedeniyle terk edildi. `/api/chat` sadece jobId döner, asıl iş Inngest worker'da |
| **CanonicalMessage formatı** | AI SDK v4/v5/v6'nın farklı part formatlarını (`tool-call`, `tool-result`, `tool-invocation`) tek tipe normalize eder |
| **Multi-Provider Model** | Prefix bazlı routing (`ollama:`, `groq:`, `openrouter:`, `*-key:`). Kullanıcı kendi API key'ini girebilir. Fallback: Ollama |
| **AI Agent (Vercel AI SDK v6 + Ollama/Çoklu)** | Qwen 3 14B modeli ile 18 tool üzerinden gerçek zamanlı finansal analiz. Multi-provider destekli |
