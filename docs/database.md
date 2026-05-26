# Veritabanı

> **Amaç:** MongoDB bağlantı yönetimi, Mongoose modelleri, koleksiyon şemaları, indexler ve veri kalıcılık desenleri.
> **Kapsam:** `database/` dizini.
> **Ayrıca bakınız:** [[architecture]], [[backend]]
> **Son güncelleme:** 2026-05-25 (AIJob type güncellemesi: process_chat_message eklendi, 10 koleksiyon)

---

## Bağlantı Yönetimi (`database/mongoose.ts`)

### Singleton Deseni

```typescript
// Global.mongooseCache, Next.js hot reload'larında bağlantının hayatta kalmasını sağlar
declare global {
  var mongooseCache: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  }
}
```

### connectToDatabase()

- Zaten bağlıysa önbellekteki bağlantıyı döner
- Tek bir bağlantı promise'i oluşturur (paralel bağlantı girişimlerini önler)
- `MONGODB_URI` env değişkeni yoksa `'MONGODB_URI must be set within .env'` hatası fırlatır
- `bufferCommands: false` kullanır — bağlantı koptuğunda işlemler kuyruğa alınmak yerine hemen hata verir
- Bağlantı başarılı log'u `[DB] Connected successfully (env: production)` formatındadır — `MONGODB_URI`'yi konsola yazmaz

**Kritik:** Bu, asla yeniden yapılandırılmaması gereken üç singleton deseninden biridir.
Global önbellek mekanizması, Next.js hot module replacement sırasında bağlantı havuzu tükenmesini önler.

---

## Koleksiyonlar (10 adet)

### 1. `user` (Better Auth tarafından yönetilir)

Mongoose modeli olarak tanımlanmamıştır — Better Auth bu koleksiyonu dahili olarak yönetir.

```
{
  _id: ObjectId,
  id: string,
  email: string,
  name: string,
  emailVerified: boolean,
  image: string | null,
  createdAt: Date,
  updatedAt: Date
}
```

**Erişim deseni:** `getWatchlistSymbolsByEmail()` ve `getAllUsersForNewsEmail()` içinde native MongoDB driver üzerinden `db.collection('user')` ile sorgulanır.

### 2. `watchlists` (`database/models/watchlist.model.ts`)

```typescript
{
  _id: ObjectId,
  userId: string,          // Better Auth user.id
  symbol: string,          // Büyük harf hisse sembolü (uppercase)
  company: string,         // Şirket adı
  addedAt: Date,           // Varsayılan: new Date()
  createdAt: Date,         // Mongoose timestamps: true
  updatedAt: Date          // Mongoose timestamps: true
}
```

**Indexler:**
- `{ userId: 1 }` — Kullanıcıya göre arama
- `{ userId: 1, symbol: 1 }` — Unique compound index (mükerrer izleme listesi girişlerini önler)

### 3. `pricealerts` (`database/models/price-alert.model.ts`)

```typescript
{
  _id: ObjectId,
  userId: string,          // Better Auth user.id
  email: string,           // Kullanıcı email'i (alarm gönderimi için denormalize)
  symbol: string,          // Büyük harf hisse sembolü
  company: string,         // Şirket adı
  alertName: string,       // Kullanıcı tanımlı alarm adı
  alertType: 'upper' | 'lower',
  threshold: number,       // Hedef fiyat
  frequency: 'daily',      // Şu anda sadece 'daily' destekleniyor
  active: boolean,         // Varsayılan: true
  lastNotifiedOn: Date | null,  // Günde bir kere sınırlaması için
  createdAt: Date,
  updatedAt: Date
}
```

**Indexler:**
- `{ userId: 1 }`, `{ email: 1 }`
- `{ active: 1, frequency: 1, symbol: 1 }` — Cron job sorgusu için compound index
- `{ userId: 1, symbol: 1 }` — Kullanıcıya özel sembol sorguları

### 4. `conversations` (`database/models/conversation.model.ts`)

```typescript
{
  _id: ObjectId,
  userId: string,          // Better Auth UUID
  title: string,           // max 100 char, Smart Title ile AI tarafından üretilir
  isPinned: boolean,       // Sabitlenmiş konuşma
  createdAt: Date,
  updatedAt: Date
}
```
Index: `{ userId: 1, updatedAt: -1 }`

### 5. `messages` (`database/models/message.model.ts`)

```typescript
{
  _id: ObjectId,
  conversationId: ObjectId,  // ref: Conversation
  userId: string,
  role: 'user' | 'assistant' | 'system' | 'tool',
  parts: Mixed,              // AI SDK parts formatı (CanonicalMessage ile normalize edilir)
  createdAt: Date
}
```
Index: `{ conversationId: 1, createdAt: 1 }`

### 6. `analysisnotes` (`database/models/analysis-note.model.ts`)

```typescript
{
  _id: ObjectId,
  userId: string,
  conversationId?: ObjectId,
  title: string,           // max 200 char
  symbol?: string,         // uppercase
  content: string,         // Markdown, max 50KB
  tags: string[],
  createdAt: Date,
  updatedAt: Date
}
```
Indexes: `{ userId: 1, symbol: 1 }`, `{ userId: 1, createdAt: -1 }`

### 7. `smartalerts` (`database/models/smart-alert.model.ts`)

```typescript
{
  _id: ObjectId,
  userId: string,
  email: string,
  name: string,            // max 100 char
  symbol: string,          // uppercase
  interval: '1d' | '4h',
  conditions: [{ indicator: string, operator: '<' | '>' | 'cross_above' | 'cross_below', value: number }],
  active: boolean,
  frequency: 'daily' | '4h' | '1h',
  lastTriggeredAt: Date | null,
  createdAt: Date
}
```
Index: `{ active: 1, frequency: 1, symbol: 1 }`

### 8. `reports` (`database/models/report.model.ts`)

Inngest arka plan AI işlemleri için rapor koleksiyonu. `aiOptimizeParameter` ve `aiRankIndicatorsJob` tarafından yazılır, `LiveAnalysisCard` tarafından polling ile okunur.

```typescript
{
  _id: ObjectId,
  jobId: string,            // unique, index — randomUUID()
  userId: string,
  symbol: string,           // uppercase
  indicator: string,        // 'RSI', 'MACD', 'FIND_BEST', 'RANK', vb.
  status: 'processing' | 'completed' | 'failed',
  bestValue: number | null,
  winRate: number | null,
  errorMessage: string | null,
  steps: Mixed[],           // [{ name, status, detail?, completedAt? }]
  fullData: Mixed | null,   // Tam optimizasyon/sıralama sonucu (JSON)
  createdAt: Date,
  updatedAt: Date
}
```
Index: `{ jobId: 1 }` (unique)

### 9. `aijobs` (`database/models/ai-job.model.ts`) — İş Takip Merkezi

Birleşik AI iş takip sistemi. İş yaşam döngüsünü yönetir, Report'a referans verir.

```typescript
{
  _id: ObjectId,
  jobId: string,            // unique, index
  userId: string,           // index
  type: 'optimize_parameter' | 'rank_indicators' | 'find_best_indicator' 
      | 'batch_watchlist_scan' | 'scheduled_scan' | 'process_chat_message',
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',  // index
  title: string,            // "AAPL için RSI optimizasyonu"
  source: 'chat' | 'notebook' | 'scheduled' | 'watchlist',
  conversationId: string,
  reportId: string,         // Tamamlanınca oluşan Report'un ID'si
  parentJobId: string,      // Batch parent
  batchId: string,          // Toplu iş grup kimliği
  input: Mixed,             // İş parametreleri { symbol, indicator, interval, ... }
  progress: number,         // 0-100
  steps: IStep[],           // [{ name, status, detail, completedAt }] — UI polling için
  errorMessage: string,
  cancellationRequested: boolean,
  startedAt: Date,
  completedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```
Index: `{ jobId: 1 }` (unique), `{ userId: 1 }`, `{ status: 1 }`

**Type açıklamaları:**
- `optimize_parameter` — Tek hisse/indikatör optimizasyonu
- `rank_indicators` — Çoklu indikatör sıralaması
- `find_best_indicator` — En iyi indikatörü bulma
- `process_chat_message` — **Ana AI sohbet işlemi** (Inngest chat-async worker'ı)
- `batch_watchlist_scan` — Toplu izleme listesi taraması
- `scheduled_scan` — Zamanlanmış tarama

### 10. `notifications` (`database/models/notification.model.ts`)

```typescript
{
  _id: ObjectId,
  userId: string,           // index
  type: 'ai_job_completed' | 'ai_job_failed' | 'smart_alert_triggered' | 'report_ready',
  title: string,            // "Optimizasyon Tamamlandı"
  message: string,          // "AAPL için RSI optimizasyonu başarıyla sonuçlandı. Win Rate: %65.5"
  status: 'unread' | 'read' | 'archived',  // index
  jobId: string,            // İlgili AI işi
  reportId: string,         // İlgili rapor
  actionUrl: string,        // "/archive/reports/{reportId}"
  readAt: Date | null,
  createdAt: Date,
  updatedAt: Date
}
```
Index: `{ userId: 1, status: 1 }`

---

## Veri Kalıcılık Desenleri

### Model Kaydı

Next.js + Mongoose için standart guard deseni:
```typescript
const Model = models.ModelName || model<IModel>('ModelName', Schema);
```

### Sorgu Deseni

Tüm veritabanı erişimi Server Actions (`lib/actions/`) üzerinden akar:
```
Client Component → Server Action → connectToDatabase() → Mongoose Model → Yanıt
```

### Zaman Damgaları

Tüm modeller `timestamps: true` kullanır — Mongoose `createdAt` ve `updatedAt` alanlarını otomatik yönetir.
Better Auth'ün `user` koleksiyonu kendi zaman damgası yönetimini kullanır.

### userId Referanslama

Tüm modeller `userId` olarak düz string kullanır (MongoDB ObjectId referansı değil).
Bu değer Better Auth'ün `user.id` alanına karşılık gelir. Foreign key constraint yoktur —
referans bütünlüğü uygulama seviyesinde yönetilir.

### AI İş Takip Yaşam Döngüsü

```
1. POST /api/chat → AIJob.create({ status: 'queued', type: 'process_chat_message' })
2. Inngest worker başlar → AIJob.updateOne({ status: 'running' })
3. onStepFinish → AIJob.updateOne({ $push: { steps: {...} } })
4. İşlem biter → AIJob.updateOne({ status: 'completed', reportId, completedAt })
5. Hata olursa → AIJob.updateOne({ status: 'failed', errorMessage })
6. Client polling → getJobByJobId(jobId) → { status, steps[], errorMessage }
```
