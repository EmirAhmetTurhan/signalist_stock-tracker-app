# Veritabanı

> **Amaç:** MongoDB bağlantı yönetimi, Mongoose modelleri, koleksiyon şemaları, indexler ve veri kalıcılık desenleri.
> **Kapsam:** `database/` dizini.
> **Ayrıca bakınız:** [[architecture]], [[backend]]
> **Son güncelleme:** 2026-05-22 (4-faz refactoring: timestamps standardizasyonu — tüm modeller `timestamps: true`)

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
- **Güncelleme 2026-05-21:** Bağlantı başarılı log'u `[DB] Connected successfully (env: production)` formatındadır — artık `MONGODB_URI`'yi (şifre dahil) konsola yazmaz

**Kritik:** Bu, asla yeniden yapılandırılmaması gereken üç singleton deseninden biridir.
Global önbellek mekanizması, Next.js hot module replacement sırasında bağlantı havuzu tükenmesini önler.

---

## Koleksiyonlar

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

**Duplicate yönetimi:** `addToWatchlist()` MongoDB E11000/duplicate hatalarını yakalar ve `{ ok: true, added: true }` döner — mükerrer girişleri sessizce başarı sayar.

### 3. `pricealerts` (`database/models/price-alert.model.ts`)

```typescript
{
  _id: ObjectId,
  userId: string,          // Better Auth user.id
  email: string,           // Kullanıcı email'i (alarm gönderimi için denormalize)
  symbol: string,          // Büyük harf hisse sembolü
  company: string,         // Şirket adı
  alertName: string,       // Kullanıcı tanımlı alarm adı
  alertType: 'upper' | 'lower',  // upper = fiyat > eşik ise bildir, lower = fiyat < eşik ise bildir
  threshold: number,       // Hedef fiyat
  frequency: 'daily',      // Şu anda sadece 'daily' destekleniyor
  active: boolean,         // Varsayılan: true
  lastNotifiedOn: Date | null,  // Günde bir kere sınırlaması için
  createdAt: Date,         // Mongoose timestamps
  updatedAt: Date          // Mongoose timestamps
}
```

**Indexler:**
- `{ userId: 1 }` — Kullanıcıya göre arama
- `{ email: 1 }` — Email'e göre arama
- `{ active: 1, frequency: 1, symbol: 1 }` — Cron job sorgusu için compound index (sembole göre aktif günlük alarmları bul)
- `{ userId: 1, symbol: 1 }` — Kullanıcıya özel sembol sorguları için compound index

**Günde bir kere mantığı:** `evaluateDailyPriceAlerts` Inngest fonksiyonu `lastNotifiedOn` tarihini kontrol eder — bugün zaten bildirildiyse atlar. Gönderdikten sonra `lastNotifiedOn`'u günceller.

---

## Veri Kalıcılık Desenleri

### Model Kaydı

Next.js + Mongoose için standart guard deseni kullanılır (model yeniden derlemesini önler):
```typescript
export const Watchlist: Model<WatchlistItem> =
  (models?.Watchlist as Model<WatchlistItem>) ||
  mongoose.model<WatchlistItem>('Watchlist', WatchlistSchema);
```

### Sorgu Deseni

Tüm veritabanı erişimi Server Actions (`lib/actions/`) üzerinden akar, asla doğrudan client bileşenlerden değil:
```
Client Component → Server Action → connectToDatabase() → Mongoose Model → Yanıt
```

### Zaman Damgaları

Tüm modeller `timestamps: true` kullanır — Mongoose `createdAt` ve `updatedAt` alanlarını otomatik yönetir.
Bu, 2026-05-22 refactoring'inde standartlaştırılmıştır (önceden bazı modeller `timestamps: false` idi).
Better Auth'ün `user` koleksiyonu kendi zaman damgası yönetimini kullanır.

### userId Referanslama

Watchlist ve PriceAlert modelleri `userId` olarak düz string kullanır (MongoDB ObjectId referansı değil).
Bu değer Better Auth'ün `user.id` alanına karşılık gelir. Foreign key constraint yoktur —
referans bütünlüğü uygulama seviyesinde yönetilir.

---

## AI Agent Modelleri (2026-05-22)

### 4. `conversations` (`database/models/conversation.model.ts`)

```typescript
{
  _id: ObjectId,
  userId: string,          // Better Auth UUID
  title: string,           // max 100 char, ilk mesajdan üretilir
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
  role: 'user' | 'assistant' | 'system',
  parts: Mixed,              // useChat v3 parts formatı (JSON)
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

### 8. `reports` (`database/models/report.model.ts`) — yeni (2026-05-21)

Inngest arka plan AI işlemleri için rapor koleksiyonu. `aiOptimizeParameter` fonksiyonu tarafından yazılır, `LiveAnalysisCard` tarafından polling ile okunur.

```typescript
{
  _id: ObjectId,
  jobId: string,            // unique, index — randomUUID()
  userId: string,           // 'inngest-system' (arka plan işlemi)
  symbol: string,           // uppercase
  indicator: string,        // 'RSI', 'MACD', vb.
  status: 'processing' | 'completed' | 'failed',
  bestValue: number | null, // optimize edilmiş parametre değeri
  winRate: number | null,   // başarı oranı (%)
  errorMessage: string | null, // kullanıcı dostu hata mesajı (2026-05-21 eklendi)
  steps: Mixed[],           // Reasoning Pipeline adımları (2026-05-21 eklendi)
                            // [{ name, status: 'pending'|'running'|'completed'|'failed', detail?, completedAt? }]
  fullData: Mixed | null,   // tam optimizasyon sonucu
  createdAt: Date,
  updatedAt: Date
}
```
Index: `{ jobId: 1 }` (unique)

### 9. `aijobs` (`database/models/ai-job.model.ts`) — yeni (2026-05-22)

Birleşik AI iş takip sistemi. İş yaşam döngüsünü yönetir, Report'a referans verir.

```typescript
{
  _id: ObjectId,
  jobId: string,            // unique, index
  userId: string,           // index
  type: 'optimize_parameter' | 'rank_indicators' | 'find_best_indicator' | 'batch_watchlist_scan' | 'scheduled_scan',
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled',  // index
  title: string,            // "AAPL için RSI optimizasyonu"
  source: 'chat' | 'notebook' | 'scheduled' | 'watchlist',
  conversationId: string,
  reportId: string,         // Tamamlanınca oluşan Report'un ID'si
  parentJobId: string,      // Batch parent
  batchId: string,          // Toplu iş grup kimliği
  input: Mixed,             // İş parametreleri { symbol, indicator, interval, ... }
  progress: number,         // 0-100
  steps: IStep[],           // [{ name, status, detail, completedAt }] — Reasoning Pipeline
  errorMessage: string,
  cancellationRequested: boolean,
  startedAt: Date,
  completedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```
Index: `{ jobId: 1 }` (unique), `{ userId: 1 }`, `{ status: 1 }`

### 10. `notifications` (`database/models/notification.model.ts`) — yeni (2026-05-22)

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
