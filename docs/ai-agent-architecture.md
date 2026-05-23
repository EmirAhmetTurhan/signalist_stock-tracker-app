# Signalist: AI Agent (Finansal Asistan) — Tam Mimarisi

> **Durum:** ✅ **Uygulandı + 4-Faz Refactoring + 6 Resilience Katmanı (2026-05-22).** 18 tool (5 savunma hattı), Router Agent kategorizasyonu, Inngest arka plan işlemleri, Generative UI (11 kart), **useChatManager** paylaşımlı hook, **INDICATOR_REGISTRY** merkezi sabit, **6 katmanlı resilience** (polling loop, onError toast, network detection, double submit lock, server error classification, stable roomKey), **Test altyapısı** (vitest, 41 test), 54+ stabilite düzeltmesi.
> **Son güncelleme:** 2026-05-22 (6 resilience katmanı + test altyapısı + kapsamlı dokümantasyon güncellemesi)

Bu doküman, Signalist platformundaki yapay zeka destekli finansal asistanın TÜM mimarisini, teknolojisini ve entegrasyonlarını detaylandırmaktadır.

---

## 1. Konsept: Neden "Chatbot" Değil de "AI Agent"?

Sisteme sıradan bir "Soru-Cevap" botu eklemek yerine, projenin veritabanına ve teknik analiz (T/A) motoruna doğrudan erişebilen bir **Agentic AI (Ajan Yapay Zeka)** kurgulanmıştır.

- **Klasik Chatbot:** Sadece genel geçer bilgiler verir ("RSI nedir?" gibi). Ekranda hangi hissenin açık olduğunu veya kullanıcının portföyünü bilemez.
- **AI Agent (Sinyal Asistanı):** Sistemin "Tool Calling" yeteneğini kullanarak, arka planda T/A motorunu çalıştırabilir. Örneğin: *"Şu an incelediğim AAPL hissesi için en güçlü Al sinyali veren indikatör hangisi?"* sorusuna, anlık mum verilerini kendi kendine çekip, matematiksel indikatör fonksiyonlarını çalıştırarak spesifik ve anlık veriyle cevap verebilir.

---

## 2. Teknoloji Yığını (Tech Stack)

| Bileşen | Teknoloji | Açıklama |
| :--- | :--- | :--- |
| **Orkestrasyon** | Vercel AI SDK v6 (`ai@^6.0.185`) | `streamText` + `generateText` + `convertToModelMessages` |
| **Client Hook** | `@ai-sdk/react` v3 (`^3.0.187`) | `useChat` hook — id bazlı izolasyon, `addToolOutput`, `onToolCall` |
| **Transport** | `DefaultChatTransport` | `headers: () => Record<string, string>` — Resolvable<T> pattern, type-safe |
| **Geliştirme (Local AI)** | Ollama | CPU/GPU üzerinde ücretsiz model çalıştırma |
| **Model (Beyin)** | Qwen 3 (14B) | Q4_K_M quantize (~9GB). Tool Calling ve JSON format sadakati yüksek |
| **Provider** | `@ai-sdk/openai-compatible` v2 | Ollama `/v1` OpenAI uyumlu endpoint |
| **Arka Plan İşleri** | Inngest v4.3.0 | `ai/optimize-parameter` + `ai/rank-indicators` event'leri → brute-force TA |
| **Global State** | Zustand | `activeJobs` (convId → jobId), optimistic watchlist, activeIndicators |
| **İş Takip** | AIJob modeli | `type`, `status`, `steps[]`, `batchId`, `reportId`, `progress` |
| **Bildirim** | Notification modeli | `ai_job_completed`, `ai_job_failed`, `report_ready`, actionUrl |
| **UI** | React 19.2.0 + Tailwind CSS v4 | `React.memo`, `next/dynamic` lazy-load, Generative UI |

> [!NOTE]
> **Canlı Ortam (Production) Stratejisi:** Geliştirme ortamında Ollama + Qwen 3 14B kullanılır. Proje canlıya alındığında tek bir satır kod değiştirilerek Groq veya Google Gemini API'ye geçiş yapılabilir. Vercel AI SDK provider değişikliği modelden bağımsızdır.

---

## 3. Frontend Mimarisi

### 3.1 Erişim Noktaları

- **Tam sayfa:** Header → "AI" linki → `/ai` (sidebar + multi-room)
- **Floating panel:** Her sayfanın sağ-alt köşesinde 💬 butonu → resize edilebilir overlay (`next/dynamic` lazy-load)
- **API:** `POST /api/chat` → streaming `text/event-stream`

### 3.2 Multi-Room Stream İzolasyonu (roomKey/convId Mimarisi)

En kritik mimari karar: React key (`roomKey`) ile DB ID (`convId`) ayrıştırılmıştır.

```
AIPage
  ├── Sidebar (konuşma listesi, streaming pulse, active job spinner)
  └── Room Container (relative overflow-hidden)
       ├── Room key="room_A" (convId="abc123", display: flex, aktif)
       ├── Room key="room_B" (convId="def456", display: none, stream arka planda)
       └── Room key="__new__" (convId="", display: none, boş)
```

**Nasıl çalışır:**
- `useChat({ id: roomKey })` — roomKey sabit, hook ASLA sıfırlanmaz. Oda değişince unmount YOK
- `convId` → `convIdRef.current` → `transport.headers()` fonksiyonu her istekte okur → `X-Conversation-Id` header'ı
- `forceNewEmptyRoom()`: zaten boş oda varsa yeni oluşturmaz, sadece `setActiveKey` yapar (DOM şişmesi önlenir)
- `activeKey` değişimi: display flex/none ile oda değişimi, unmount YOK

### 3.3 Transport Pattern (Type-Safe, Resolvable)

```typescript
const convIdRef = useRef(convId);
convIdRef.current = convId;

const transport = useMemo(() => new DefaultChatTransport({
  api: '/api/chat',
  headers: (): Record<string, string> => {
    const h: Record<string, string> = {};
    const id = convIdRef.current;
    if (id) h['X-Conversation-Id'] = id;
    return h;
  },
}), []);
```

### 3.4 Lazy Conversation Creation (ChatGPT Davranışı)

"New Chat" DB'ye KAYDETMEZ, sadece UI açar. İlk mesajda `createConversation` çağrılır:
- `roomKey` sabit kalır → ChatArea UNMOUNT OLMAZ
- `convIdRef.current` güncellenir → sonraki mesajlar doğru ID ile gider
- `onCreated(roomKey, newDbId)` → parent `rooms` state'ini günceller, URL'i değiştirir
- Hiç mesaj yazılmadan çıkılırsa DB'de iz kalmaz

### 3.5 Mesaj Hydration ve Cooling Grace Period

```typescript
// Hydration: sadece convId değişince, stream varsa atlanır
useEffect(() => {
  if (!convId || messages.length > 0 || hasFetchedRef.current) return;
  // DB'den yükle... (loading skeleton gösterilir)
}, [convId]);

// Cooling grace period: stream biten oda hemen unmount edilmez
// 5 saniye coolingIds'te kalır → onFinish DB'ye yazmayı tamamlar
```

### 3.6 AI Bileşenleri

| Bileşen | Dosya | Amaç |
|---------|-------|------|
| **ChatArea** | `app/(root)/ai/page.tsx` | `React.memo`'lu, `useChatManager` hook'u ile sadeleştirildi (~25 satır chat mantığı), `roomKey`/`convId` ayrımı, DB hydration, auto-scroll (hook'tan) |
| **GenerativeUI** | `components/ai/GenerativeUI.tsx` | `React.memo`'lu. 3 katmanlı veri algılama: (1) completedOpt (bestValue+winRate → statik kart), (2) bgJob (jobIds[] + isBatch → LiveAnalysisCard veya batch notice), (3) optimizeParameter/askClarification tool-call gizleme. Component Registry tabanlı dinamik kart render |
| **LiveAnalysisCard** | `components/ai/LiveAnalysisCard.tsx` | 1.5 saniye polling ile Inngest arka plan işlemini canlı takip. Tamamlanınca `AnalysisResultCard` render eder (F5 gerekmez). Zustand `removeActiveJob` ile sidebar spinner'ı kapatır |
| **AnalysisResultCard** | `components/ai/LiveAnalysisCard.tsx` | Statik yeşil sonuç kartı (polling yapmaz). Win Rate + Best Parameter grid + "View in Notebook" / "Apply to Chart" butonları |
| **ToolProgress** | `components/ai/ToolProgress.tsx` | `React.memo`'lu. AI SDK v6 + v4/v5 format desteği (`normalizePart()`). 18 tool için friendly label, spinner → checkmark/error geçişi |
| **ClarificationForm** | `components/ai/ClarificationForm.tsx` | AI eksik bilgi sorduğunda: soru + quick-reply butonları + özel metin girişi + Send. Sadece son mesajda gösterilir (`isLast` kontrolü) |
| **MarkdownRenderer** | `components/ai/MarkdownRenderer.tsx` | `React.memo`'lu. `react-markdown` + `remark-gfm` ile zengin Markdown |
| **FloatingChatButton** | `components/ai/FloatingChatButton.tsx` | `next/dynamic` lazy-load. `useChatManager` hook'u + `addToolOutput` + DB hafıza + konuşma geçmişi dropdown + GenerativeUI + ToolProgress |
| **useChatManager** | `hooks/useChatManager.ts` | Paylaşımlı chat hook'u — transport, hydration, stale timer, lazy creation, auto-scroll, onToolCall. AI sayfası ve FloatingChatButton aynı hook'u kullanır |

### 3.7 Zustand Global State (Optimistic UI + Job Tracking)

**Dosya:** `store/useAppStore.ts`

```typescript
interface AppState {
  watchlist: WatchlistItem[];           // Optimistic ekleme/çıkarma
  activeIndicators: string[];          // AI → TA sayfası anında geçiş
  lastToolAction: { tool, payload };   // Hangi tool tetiklendi?
  activeJobs: Record<string, string>;  // convId → jobId (sidebar spinner)
}
```

**Akış:**
1. AI `addToWatchlist` tool'unu çağırır → `onToolCall` → `addToWatchlistOptimistic()` → UI anında güncellenir
2. AI `optimizeParameter` tool'unu çağırır → GenerativeUI `addActiveJob(convId, jobId)` → sidebar'da Loader2 spinner
3. Inngest tamamlanır → LiveAnalysisCard polling → `removeActiveJob(convId)` → spinner kaybolur

---

## 4. Backend Mimarisi

### 4.1 API Route (`app/api/chat/route.ts`)

**Coklu saglayici (multi-provider):** `resolveModel()` fonksiyonu `provider:modelId` formatini cozumler.
`ollama:qwen3:14b` -> lokal, `groq:llama-3.3-70b` -> Groq Cloud, `openrouter:...` -> OpenRouter.

**Kritik parametreler:**
- **`stopWhen: stepCountIs(5)`:** AI SDK v6'da `maxSteps` PARAMETRESI YOKTUR. `// @ts-ignore` ile gizlenen bu hata, SDK'nin sessizce `stepCountIs(1)` varsayilanini kullanmasina neden oluyordu -- tek tool adimi sonrasi stream duruyor, UI bos kaliyordu. Bu, tool-calling islemlerinin neden basarisiz oldugunun KOK NEDENIDIR.
- **Sliding Window:** `messages.slice(-6)` -- token tasarrufu icin
- **Smart Title:** `generateText()` ile paralel LLM cagrisi -- secili model kullanilir, `maxOutputTokens: 256`
- **`onFinish` + `result.response` ikilisi:** `onFinish` normal akis icin, `result.response` client disconnect yedegi. `responseSaved` bayragi cift kaydi onler.
- **Saglayici bazli limitler:** Cloud'da `maxOutputTokens: 2048`, Ollama'da limitsiz.
- **Dinamik model secimi:** `body.selectedModel` ve `body.apiKey` uzerinden client'tan gelen model/provider secimi yapilir.


### 4.2 Tools (`lib/ai/tools.ts`) — 18 Tool (5 Savunma Hattı + Router Agent + Actions Layer)

> **2026-05-22 Refactoring:** `createPriceAlert` ve `deletePriceAlert` tool'ları artık `lib/actions/alerts.actions.ts` üzerinden (`createAlert`, `deleteAlert`), `createSmartAlert` ve `getSmartAlerts` ise `lib/actions/smart-alerts.actions.ts` üzerinden çalışır. Doğrudan DB model import'u kaldırıldı.

**Router Agent Kategorileri (System Prompt'ta tanımlı):**

| Kategori | Tool'lar | Kullanım |
|----------|---------|----------|
| `[SYSTEM]` | `askClarification` | Eksik bilgi toplama (stopWhen ile anında durur) |
| `[TA_TOOLS]` | `analyzeIndicators`, `getCurrentPrice` | Anlık durum sorguları |
| `[RESEARCH_TOOLS]` | `runBacktest`, `optimizeParameter`, `batchOptimizeParameter`, `rankIndicators`, `findBestIndicator`, `getMarketNews` | Analiz/araştırma sorguları |
| `[USER_TOOLS]` | `getWatchlist`, `addToWatchlist`, `removeFromWatchlist`, `createPriceAlert`, `deletePriceAlert`, `getUserAlerts`, `createSmartAlert`, `getSmartAlerts` | Kullanıcı aksiyonları |
| `[SEARCH]` | `searchStock` | Hisse arama |

**5 savunma hattı:**
1. **Strict Zod:** `requiredSymbol` şeması — AI'a "sembol yoksa tool'u çağırma" talimatı
2. **Try-Catch:** Tüm 18 execute fonksiyonu try-catch ile sarılı → `{ success: false, error }`
3. **Timeout:** `withTimeout()` — veri çekme 15sn, ağır işlem **25sn** (browser timeout'undan önce)
4. **Event-Loop Yield:** `yieldToMain()` — CPU-bound işlemler öncesi Event Loop'a nefes alma
5. **İnsancıl Hata:** `toToolError()` — `errorCode` + `userMessage` + `recoverable` (6 hata deseni otomatik tespit)

**2026-05-22 Yeni Tool'lar:**
- **`askClarification`:** Eksik bilgi (sembol, indikatör) varsa AI bu tool'u çağırır. `stopWhen: hasToolCall('askClarification')` ile stream ANINDA durur. Client'ta `ClarificationForm` render edilir (soru + quick-reply butonları + özel metin girişi). AI'ın "Hangi hisseyi analiz etmemi istersiniz?" diye 20-30sn metin üretmesini ENGELLER
- **`batchOptimizeParameter`:** Çoklu hisse için tek seferde optimizasyon (max 10 hisse). Her hisse için ayrı `ai/optimize-parameter` event'i, aynı `batchId` ile
- **`rankIndicators` + `findBestIndicator`:** Artık **Inngest arka plan işlemi** olarak çalışır (eskiden 30-45sn senkron, client timeout riski). `ai/rank-indicators` event'i → `aiRankIndicatorsJob`

### 4.3 Inngest Arka Plan İşlemleri

**Dosya:** `lib/inngest/functions.ts`

#### `aiOptimizeParameter` (event: `ai/optimize-parameter`)
- `retries: 0` — tekrar deneme yok
- `batchId` desteği — toplu işlem gruplaması
- `userId` event'ten alınır

```typescript
// Tool execute (lib/ai/tools.ts):
const jobId = randomUUID();
await inngest.send({ name: 'ai/optimize-parameter', data: { jobId, batchId, symbol, indicator, interval, userId } });
return { success: true, isBackgroundJob: true, jobId, ... };

// Inngest function:
1. step.run('create-ai-job') → AIJob.create({ jobId, type: 'optimize_parameter', status: 'running', steps[] })
2. step.run('run-optimization') → Mum verisi + findBestParameter() + step güncellemeleri
3. step.run('update-report') → Report.create() + AIJob.updateOne({ status: 'completed', reportId }) + Notification.create()
4. Hata → AIJob.updateOne({ status: 'failed', errorMessage }) + Notification.create({ type: 'ai_job_failed' })
```

#### `aiRankIndicatorsJob` (event: `ai/rank-indicators`) — yeni (2026-05-22)
- `retries: 0`
- Hem `rankIndicators` hem `findBestIndicator` için tek fonksiyon (`isSingle` flag'i)
- `years` parametresi (1-10 yıl, varsayılan 5)
- Aynı AIJob + Notification pattern'i

**Veritabanı:**
- `database/models/report.model.ts` — Sonuç konteyneri (`jobId` unique, `status`, `bestValue`, `winRate`, `errorMessage`, `fullData`)
- `database/models/ai-job.model.ts` — İş takip (`jobId` unique, `type`, `status`, `title`, `source`, `steps[]`, `batchId`, `reportId`, `progress`, `cancellationRequested`)
- `database/models/notification.model.ts` — Kullanıcı bildirimi (`userId`, `type`, `title`, `message`, `status`, `actionUrl`)

### 4.4 DB Hafıza Katmanı

**Modeller (7 koleksiyon):**
- `conversation.model.ts` — `title`, `isPinned`, `updatedAt`
- `message.model.ts` — `parts: Schema.Types.Mixed` (AI SDK v6 parts formatı)
- `analysis-note.model.ts` — Research Notebook notları
- `smart-alert.model.ts` — Smart strateji alarmları
- `report.model.ts` — Inngest arka plan işlem SONUÇLARI (`jobId` unique, `status`, `bestValue`, `winRate`, `errorMessage`, `fullData`)
- **`ai-job.model.ts`** — Birleşik AI iş takip (yeni 2026-05-22): `jobId` unique, `type` (optimize_parameter/rank_indicators/find_best_indicator/batch_watchlist_scan/scheduled_scan), `status` (queued/running/completed/failed/cancelled), `source` (chat/notebook/scheduled/watchlist), `batchId`, `steps[]`, `progress`, `reportId`
- **`notification.model.ts`** — Kullanıcı bildirimleri (yeni 2026-05-22): `userId`, `type` (ai_job_completed/ai_job_failed/smart_alert_triggered/report_ready), `title`, `message`, `status` (unread/read/archived), `actionUrl`

**Server Actions:**
- `chat-history.actions.ts` — CRUD + `updateConversationTitle()`, `togglePinConversation()`
- `report.actions.ts` — `getReportByJobId(jobId)` → `{ status, bestValue, winRate, errorMessage, steps[], fullData }`

---

## 5. Mimari Hiyerarşi ve Akış Krokisi

```text
Kullanıcı (Frontend)
  ├── Tam sayfa AI (/ai) — sidebar + multi-room ChatArea
  │     ├── Sidebar: konuşma listesi + activeJobs spinner (Loader2)
  │     └── ChatArea: GenerativeUI → LiveAnalysisCard (3s polling) / AnalysisResultCard (statik)
  └── Floating panel — her sayfada sağ-alt overlay (next/dynamic)
       │
       ▼
Next.js API Route (Backend - app/api/chat/route.ts)
  ├── Sliding Window: messages.slice(-10)
  ├── Smart Title: generateText() fire-and-forget (ilk mesaj)
  ├── Vercel AI SDK streamText() + maxSteps: 5
  └── Tools (16 tool, 4 savunma hattı, Router Agent kategorili)
       │
       ├── [TA_TOOLS] → Finnhub/Yahoo → lib/ta/ compute + signals
       ├── [RESEARCH_TOOLS] → Backtest + Optimizer + Inngest (arka plan)
       ├── [USER_TOOLS] → Watchlist + Price Alert + Smart Alert
       └── [SEARCH] → Finnhub searchStock
       │
       ▼
Yorumlama ve Yanıt (AI -> Frontend)
  ├── ToolProgress: canlı tool durumu (spinner → ✓/✗)
  ├── GenerativeUI: dinamik butonlar + LiveAnalysisCard/AnalysisResultCard
  └── MarkdownRenderer: zengin metin çıktısı
```

---

## 6. Gerçek Zamanlı UI Mimarisi (Faz 11 — 2026-05-21)

### 6.1 LiveAnalysisCard (Polling Tabanlı Canlı Takip)

```
Kullanıcı "optimize RSI for AAPL" der
  → AI, optimizeParameter tool'unu çağırır
  → Tool, Inngest'e jobId'li event gönderir, { isBackgroundJob: true, jobId } döner
  → GenerativeUI: getBackgroundJobInfo() → jobId'yi yakalar
     → Zustand: addActiveJob(convId, jobId) → sidebar'da Loader2 spinner
     → LiveAnalysisCard mount: 3 saniye polling başlar
  → Inngest: brute-force TA hesaplaması (30-45sn)
     → Report koleksiyonu: status: 'completed', bestValue, winRate
  → LiveAnalysisCard: polling → completed → AnalysisResultCard render (YEŞİL)
     → Zustand: removeActiveJob(convId) → sidebar spinner KAYBOLUR
     → F5 GEREKMEZ — her şey canlı
```

### 6.2 AnalysisResultCard (Statik Tamamlanmış Veri)

```
Kullanıcı sayfayı yeniler veya sohbete geri döner
  → DB'den mesaj yüklenir
  → Mesajın tool-result kısmında bestValue + winRate VAR (Inngest güncellemiş)
  → getCompletedOptimizationData() → veriyi yakalar (isBackgroundJob flag'i YOK)
  → AnalysisResultCard direkt render edilir (polling YOK, veri zaten hazır)
```

### 6.3 OptimizeParameter Tool-Call Gizleme

```
AI, optimizeParameter tool'unu çağırdığında (tool-call aşaması):
  → hasOptimizeParamCall && !hasOptimizeParamResult && !hasText
  → GenerativeUI return null (siyah "Optimizing parameters" kutusu GÖSTERİLMEZ)
  → ToolProgress hala ChatArea'da gösterilir (tool durum takibi)
```

---

## 7. Hata Geçmişi ve Çözümleri (48+ düzeltme)

| # | Sorun | Kök Neden | Çözüm |
|---|-------|-----------|-------|
| 1 | `ollama-ai-provider` V1 model | AI SDK v6 V2/V3 istiyor | `@ai-sdk/openai-compatible` + Ollama `/v1` |
| 2 | AI yanıt vermiyor | `useChat` v3 `parts[]` formatı, model `content` bekliyor | `convertToModelMessages()` |
| 3 | Stream client'ta görünmüyor | `toTextStreamResponse()` | `toUIMessageStreamResponse()` |
| 4 | İlk mesaj DB'ye kaydedilmiyor | `createConversation` async, `sendMessage` önce çağrılıyor | `await createConversation` → sonra `sendMessage` |
| 5 | `X-Conversation-Id` header ulaşmıyor | `useChat` transport ref'ini güncellemiyor | `cidRef` + `headers()` fonksiyonu (Resolvable) |
| 6 | `prepareSendMessagesRequest` mesajları siliyor | SDK body'sini override ediyor | `cidRef` + `headers()` pattern'ine geri dönüldü |
| 7 | Geçmiş mesajlar UI'da görünmüyor | `prevConvRef` başlangıcı `conversationId` ile aynı | `useRef<string \| null>(null)` |
| 8 | `<button>` içinde `<button>` | `DropdownMenuTrigger` zaten `<button>` | Dış element `<div role="button">` |
| 9 | Panel boyutu hydration mismatch | `localStorage` SSR'da yok | `useEffect` ile client-only yükleme |
| 10 | Stream odalar arası karışıyor | Tek `useChat` instance'ı | `useChat({ id })` + multi-room render |
| 11 | Scroll çalışmıyor | Container sabit yükseklikte değil | `messagesEndRef` + `scrollIntoView({ behavior: 'instant' })` |
| 12 | Mesaj 0.5sn gösterilip kayboluyor | Kullanıcı mesajı await'siz DB'ye yazılıyor | `await saveMsg()` + `normalizeParts()` |
| 13 | Tool çağrıları sırasında AI yanıtı kayboluyor | `if (!text) return null` tool mesajlarını gizliyor | `hasContent()` — tool çağrıları text olmasa da gösterilir |
| 14 | Yukarı kaydırınca anında aşağı itiliyor | Her chunk'ta zorla `scrollIntoView` | `ResizeObserver` + `isAtBottomRef` |
| 15 | Çift yükleme / stream bozulması | Hydration `status` değişiminde tetikleniyor | Bağımlılık dizisi `[conversationId]` olarak basitleştirildi |
| 16 | `onFinish` mesaj formatı bozuk | AI SDK v6 response formatı normalize edilmiyordu | `normalizeParts()` string/array/undefined → `parts[]` |
| 17 | Flexbox: input bar ekran altına kayıyor | `min-height: auto` varsayılanı | `min-h-0` flex zincirine eklendi |
| 18 | Boş sohbet DB'ye kaydediliyor | "New Chat" tıklanınca eager creation | Lazy creation (ilk mesajda oluştur) |
| 19 | Tool hataları sonsuz spinner | Try-catch yoktu | 4 savunma hattı (Zod + try-catch + timeout + yield) |
| 20 | Stream sırasında sohbet değişince cevap kaybı | Oda unmount oluyor | Cooling grace period (5sn) + boş DB koruması |
| 21 | Sohbet geçişinde boş ekran flash'ı | `setMessages([])` anında temizliyor | Loading skeleton (`isHydrating`) |
| 22 | optimizeParameter sonsuz "Processing" | Inngest sonucu `isBackgroundJob` flag'i olmadan DB'ye yazılıyor | `getCompletedOptimizationData()` — bestValue + winRate direkt tespit |
| 23 | Tamamlanan işlem sidebar'da görünmüyor | Global job tracking yoktu | Zustand `activeJobs` + sidebar Loader2 spinner |
| 24 | Sohbet başlıkları "New Chat" olarak kalıyor | Statik başlık | Smart Title: `generateText()` ile ilk mesajdan 3 kelimelik başlık |
| 25 | AI yanıt vermiyor, thinking kayboluyor, refresh gerek | `hasContent()` AI SDK v6 `tool-invocation` tipini tanımıyor → mesajlar gizleniyor | `hasContent` + `ToolProgress`: `type: 'tool-invocation'` desteği eklendi |
| 26 | Build kırık: `Suspense` bulunamadı | Import eksik | `Suspense` React import'una eklendi |
| 27 | Floating panel'de ClarificationForm + follow-up çalışmıyor | `isLast`, `onFollowUp`, `convId` prop'ları eksik | FloatingChatButton GenerativeUI çağrısına 3 prop eklendi |
| 28 | rankIndicators/findBestIndicator client timeout | 30-45sn senkron işlem | Inngest arka plan işlemine taşındı (`aiRankIndicatorsJob`) |
| 29 | AI eksik bilgide 20-30sn metin üretiyor | AI "Hangi hisse?" diye uzun metin yazıyor | `askClarification` tool + `stopWhen` → anında durdurma + ClarificationForm |

---

## 8. NPM Paketleri

| Paket | Versiyon | Not |
|-------|----------|-----|
| `ai` (Vercel AI SDK) | ^6.0.185 | `streamText` + `generateText` + `convertToModelMessages` + `DefaultChatTransport` |
| `@ai-sdk/react` | ^3.0.187 | `useChat` hook (v3 API, `id` bazlı izolasyon, `addToolOutput`, `onToolCall`) |
| `@ai-sdk/openai-compatible` | ^2.0.47 | Ollama `/v1` endpoint provider'ı |
| `zustand` | — | Global state (activeJobs, watchlist, activeIndicators) |
| `inngest` | ^4.3.0 | Arka plan iş orchestrasyonu (`ai/optimize-parameter` + `ai/rank-indicators` event'leri) |

`--legacy-peer-deps` ile kuruldu (React 19.2.0 ile `@ai-sdk/react` 3.0.187 peer dependency uyuşmazlığı).

---

## 9. Performans Optimizasyonları (2026-05-19)

| # | Optimizasyon | Dosya | Etki |
|---|-------------|------|------|
| 1 | `React.memo` — ChatArea + MarkdownRenderer + ToolProgress + GenerativeUI + NavItems | 5 bileşen | Gizli odalar re-render yapmaz |
| 2 | `next/dynamic` — FloatingChatButton | `layout.tsx` | ~100KB lazy-load |
| 3 | `next/dynamic` — 16 Lightweight*Chart | `ta/page.tsx` | Canvas SSR dışı |
| 4 | `next/dynamic` — SearchCommand (cmdk) | `NavItems.tsx` | ~15KB lazy-load |
| 5 | `useEffect` + `import()` — country-list + circle-flags | `CountrySelectField.tsx` | ~50KB lazy-load |
| 6 | `.select()` + `.limit()` — DB sorguları | `chat-history.actions.ts` | Wire transfer %70 azalır |
| 7 | `console.log` DEBUG kaldırıldı | `chat-history.actions.ts` | Her hydration'da JSON.stringify blokajı gider |
| 8 | localStorage throttle — sadece stream bitince | `FloatingChatButton.tsx` | Main thread blokajı gider |
| 9 | streamingMap bail-out — değer değişmeyince re-render yok | `page.tsx` | Sidebar gereksiz render durur |

---

## 10. Ollama Kurulumu

```bash
ollama run qwen3:14b
```

Ollama kurulu değilse `/api/chat` endpoint'i hata döner, kod derlenir.
