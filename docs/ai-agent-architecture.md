# Signalist: AI Agent (Finansal Asistan) — Tam Mimarisi

> **Durum:** ✅ **Uygulandı ve Aktif.** 
> **Son güncelleme:** 2026-05-26 (6-Faz Kararlılık Revizyonu: CanonicalMessage, Component Registry, Inngest Polling, Hata Toleransı)

Bu doküman, Signalist platformundaki yapay zeka destekli finansal asistanın TÜM mimarisini, teknolojisini ve entegrasyonlarını detaylandırmaktadır. Bu doküman, son yapılan 6-Faz Kararlılık Revizyonu'nu yansıtacak şekilde güncellenmiştir.

---

## 1. Konsept: Neden "Chatbot" Değil de "AI Agent"?

Sisteme sıradan bir "Soru-Cevap" botu eklemek yerine, projenin veritabanına ve teknik analiz (T/A) motoruna doğrudan erişebilen bir **Agentic AI (Ajan Yapay Zeka)** kurgulanmıştır.

- **Klasik Chatbot:** Sadece genel geçer bilgiler verir ("RSI nedir?" gibi). Ekranda hangi hissenin açık olduğunu veya kullanıcının portföyünü bilemez.
- **AI Agent (Sinyal Asistanı):** Sistemin "Tool Calling" yeteneğini kullanarak, arka planda T/A motorunu çalıştırabilir. Örneğin: *"Şu an incelediğim AAPL hissesi için en güçlü Al sinyali veren indikatör hangisi?"* sorusuna, anlık mum verilerini kendi kendine çekip, matematiksel indikatör fonksiyonlarını çalıştırarak spesifik ve anlık veriyle cevap verebilir.

---

## 2. Teknoloji Yığını (Tech Stack)

| Bileşen | Teknoloji | Açıklama |
| :--- | :--- | :--- |
| **Orkestrasyon** | Inngest v4.3.0 + Vercel AI SDK v6 | İşlemler `ai/process-chat-message` event'i ile arka plana alınır, AI SDK `generateText` ile yönetilir |
| **Mesaj Hattı** | CanonicalMessage | Vercel AI SDK güncellemelerinden (v4/v5/v6) bağımsızlaştıran veri adaptör katmanı |
| **Client Hook** | Custom `useChatManager` | Arka plandaki Inngest görevini (jobId) saniyede bir polling ile takip eder ve UI'a aktarır |
| **Transport** | REST API Polling | `/api/chat` sadece Inngest JobId döner. `useChatManager` DB üzerinden senkronize eder |
| **Geliştirme (Local AI)** | Ollama | CPU/GPU üzerinde ücretsiz model çalıştırma |
| **Model (Beyin)** | Qwen 3 (14B) | Q4_K_M quantize (~9GB). Tool Calling ve JSON format sadakati yüksek |
| **Arka Plan İşleri** | Inngest v4.3.0 | `ai/optimize-parameter`, `ai/rank-indicators` gibi ağır (Heavy) CPU gerektiren işlemler |
| **Global State** | Zustand | `activeJobs` (convId → jobId), optimistic watchlist, activeIndicators |
| **İş Takip** | AIJob modeli | `type`, `status`, `steps[]`, `batchId`, `reportId`, `progress` |
| **UI Rendering** | Component Registry | `TOOL_COMPONENT_MAP` ile if/else olmadan dinamik kart renderlama sistemi |
| **Araştırma / Backtest** | Tool Set | `runBacktest`, `optimizeParameter`, `batchOptimizeParameter`, `rankIndicators`, `findBestIndicator`, `getMarketNews`, `startForwardTest` |
| **Kullanıcı / Aksiyon** | Tool Set | `getWatchlist`, `addToWatchlist`, `removeFromWatchlist`, `createPriceAlert`, `deletePriceAlert`, `getUserAlerts`, `createSmartAlert`, `getSmartAlerts` |
| **Portföy / İşlem** | Tool Set | `getPortfolioStatus`, `proposeTrade`, `stopForwardTest` |

> [!NOTE]
> **Canlı Ortam (Production) Stratejisi:** Geliştirme ortamında Ollama + Qwen 3 14B kullanılır. Proje canlıya alındığında tek bir satır kod değiştirilerek Groq veya Google Gemini API'ye geçiş yapılabilir. Vercel AI SDK provider değişikliği modelden bağımsızdır.

---

## 3. Frontend Mimarisi

### 3.1 Erişim Noktaları ve Multi-Room İzolasyonu
Frontend'de AI Asistanı hem tam sayfa (`/ai`) hem de floating panel (sağ-alt köşe) üzerinden erişilebilir durumdadır. İzolasyon için **React key (`roomKey`) ile DB ID (`convId`) ayrıştırılmıştır:**

- `useChat({ id: roomKey })` ile hook ASLA sıfırlanmaz, oda değiştiğinde unmount YOK.
- `activeKey` değişimi ile DOM'da `display: flex/none` geçişi yapılır. Bu sayede arka planda stream eden bir işlem kesilmez.

### 3.2 Transport ve Polling Pattern (`useChatManager`)
Uzun süren işlemlerde yaşanan HTTP timeout (524) kopmalarını engellemek için **Polling** yaklaşımı kullanılır:

1. **İstek:** `POST /api/chat` çağrılır, Inngest `jobId` alınır.
2. **Kayıt:** `useChatManager` hook'u içinde `addActiveJob(convId, jobId)` tetiklenir.
3. **Takip (Polling):** Hook, Inngest görevini tamamlanana kadar **1.5s aralıklarla** sorgular (Reasoning progress).
4. **Sonuç (addToolOutput):** Görev tamamlandığında `addToolOutput` tetiklenerek sonucun UI'a render edilmesi sağlanır ve MongoDB'den güncel geçmiş çekilir (`fetchMessages`).

### 3.3 State Hydration (LocalStorage + DB)
Sohbet oturumlarının yönetimi `localStorage` ve veritabanı ile çift katmanlı yürütülür:
- **Lazy Creation:** Yeni mesaj yazılmadan veritabanına boş konuşma kaydedilmez.
- **Hydration:** Sayfa yenilendiğinde sohbet hafızası `localStorage` ve `convId` üzerinden otomatik onarılır.

### 3.4 AI UI Bileşenleri ve Component Registry
En büyük mimari atılımlardan biri olan **6-Faz Kararlılık Revizyonu** ile frontend if/else bloklarından kurtarılmıştır.

## Token Güvenliği (HMAC Trade Proposals)
Yapay zeka asistanı işlem önerme yetkisine (`proposeTrade`) sahiptir, ancak **asla doğrudan işlem gerçekleştiremez.**
- Sistem, kullanıcının işlem onayını almak için AI tarafından üretilen bir **HMAC-SHA256 imzalı JWT benzeri Token** kullanır.
- Token içerisinde hisse sembolü, yön, miktar, anlık fiyat ve 5 dakikalık son kullanım tarihi (`expiresAt`) bulunur.
- Frontend, onay esnasında bu token'ı backend server action'ına iletir (`executeTradeWithToken`).
- İmza doğrulaması sayesinde tarayıcı üzerinden manipülasyon (örn: 10 adet yerine 10000 adet gönderme) engellenmiş olur.

| Bileşen / Sistem | Dosya | Amaç |
|---------|-------|------|
| **Component Registry** | `components/ai/registry.tsx` | `TOOL_COMPONENT_MAP` üzerinden 12 farklı araç için dinamik kartları map eder. |
| **ChatArea** | `app/(root)/ai/page.tsx` | `useChatManager` entegrasyonlu, `React.memo`'lu sohbet alanı. |
| **GenerativeUI** | `components/ai/GenerativeUI.tsx` | Gelen `toolCall` isimlerine göre dinamik olarak doğru kart bileşenini Registry'den çağırır. |
| **ErrorCard** | `components/ai/ErrorCard.tsx` | Hata mesajlarını tespit edip şık bir kırmızı uyarı kartı ve eylem butonları (Retry vs.) sunar. |

---

## 4. Backend Mimarisi

### 4.1 Message Pipeline: CanonicalMessage Katmanı
Vercel AI SDK versiyon değişikliklerinden (tool-call vs tool-invocation) etkilenmemek için **`lib/ai/message-format.ts`** oluşturulmuştur.
- Bütün gelen formatları tek bir tipolojiye indirger: `{ type: 'tool-call', toolCallId, toolName, input }`
- Hataları veya bozuk stream durumlarını filtreler.

### 4.2 API Route ve Asenkron İşlem Motoru
`app/api/chat/route.ts` doğrudan LLM'i çalıştırmaz. Sadece kullanıcı mesajını kaydeder, bir `AIJob` başlatır ve Inngest'e `ai/process-chat-message` event'ini atıp geri döner.

**Asıl Beyin (`lib/inngest/chat-async.ts`):**
- Inngest arka plan çalışanı, LLM çağrılarını (`generateText`) yapar.
- Model araç çağırdığında (`tools.ts`), işlemler çalıştırılır ve ilerleme `AIJob` üzerinde `steps` aracılığıyla veritabanına işlenir.
- İşlem bittiğinde tool yanıtları ve asistan cevapları veritabanına eklenir.

### 4.3 Tools (`lib/ai/tools.ts`) — 18 Tool ve Güvenlik Zırhı
Agent, toplamda 18 farklı finansal araca sahiptir.
(Tam veri akışı ve araçların listesi için [AI Tools Veri Akış Raporu](ai-tools-data-flow.md) belgesini inceleyin).

**4 Savunma Hattı:**
Sistemin kırılmasını önleyen üretim seviyesi önlemler:
1. **Strict Zod Şemaları:** Sıkı tip kontrolleri (ör. `requiredSymbol`). Zod şeması uymazsa araç hiç tetiklenmez.
2. **Try-Catch Block:** Her aracın `execute` fonksiyonu kendi izole alanında yakalanır.
3. **Zaman Aşımı (Timeout):** API çağrıları için 30sn, ağır matematiksel işlemler için 45sn sınırı (`withTimeout` wrapper'ı).
4. **İnsancıl Hata (Graceful Error):** `toToolError()` fonksiyonu ile teknik hatalar `errorCode`, `userMessage` ve `recoverable: boolean` formatına dönüştürülüp `ErrorCard`'a yansıtılır.

---

## 5. Mimari Akış Krokisi

```text
Kullanıcı (Frontend)
  ├── POST /api/chat
  └── Polling Başlar (1.5s aralıklarla)
       │
       ▼
Next.js API Route (app/api/chat/route.ts)
  ├── Mesajı veritabanına (Message Collection) yazar
  ├── AIJob veritabanı kaydını oluşturur
  ├── Inngest Event: ai/process-chat-message fırlatır
  └── { jobId, success } yanıtı döner
       │
       ▼
Inngest Worker (lib/inngest/chat-async.ts)
  ├── Vercel AI SDK generateText() çalıştırılır
  ├── LLM bir araç seçer (ör: analyzeIndicators)
  ├── Araç `lib/ai/tools.ts` üzerinden çalıştırılır (Zod, Timeout, Hata kontrolü)
  ├── AIJob step güncellemeleri veritabanına yazılır (UI progress bar için)
  └── Final sonucu veritabanına yazıp işlemi tamamlar
       │
       ▼
Frontend Polling (useChatManager)
  ├── completed sinyalini alır
  ├── DB'den güncel mesajları çeker (fetchMessages)
  └── Component Registry, ilgili ToolCard'ı render eder
```

---

## 6. Özet Sonuç
Geliştirilen bu asenkron ve modüler yapı sayesinde:
- Sistem **Vercel timeout sınırlarına takılmaz**.
- UI kodları karmaşık if/else bloklarından kurtulmuş, **Component Registry** ile yönetilebilir hale gelmiştir.
- AI'ın tool formatlarında yaptığı hatalar veya bağlantı kesintileri UI'da düzensiz yazılar yerine, eyleme geçirilebilir **ErrorCard** uyarıları olarak gösterilmektedir.
