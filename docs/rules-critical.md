# Kritik Kurallar & Uyarılar

> **Amaç:** Asla gelişigüzel değiştirilmemesi gereken dosyalar ve sistemler, mimari değişmezler, rate limitler ve tehlikeli işlemler.
> **Kapsam:** Proje çapında kritik yollar.
> **Ayrıca bakınız:** [[architecture]], [[database]], [[deployment-env]]
> **Son güncelleme:** 2026-05-25 (CanonicalMessage + tool-contracts + useChatManager kritik dosyalara eklendi)

---

## Değiştirilmemesi Gerekenler (Tam Anlaşılmadan)

### 1. Middleware Matcher (`middleware/index.ts`)

```typescript
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sign-in|sign-up|assets).*)'],
};
```

**Neden:** Bu regex hangi route'ların kimlik doğrulama gerektirdiğini kontrol eder. Tek bir karakter değişikliği, tüm uygulamayı kullanıcılara kilitleyebilir veya korumalı route'ları kimlik doğrulamasız erişime açabilir.

**Bozmanın sonucu:** Tüm route koruması kaybolur veya uygulama tamamen erişilemez hale gelir.

### 2. Better Auth Singleton (`lib/better-auth/auth.ts`)

**Neden:** Better Auth tam olarak bir instance gerektirir. Top-level `await getAuth()` teknik olarak anti-pattern'dir ancak Better Auth'ün Next.js entegrasyonu tarafından zorunlu kılınır.

**Bozmanın sonucu:** Birden fazla auth instance'ı, memory leak'ler, oturum bozulması.

### 3. MongoDB Bağlantı Önbelleği (`database/mongoose.ts`)

**Neden:** Global önbellek olmadan her HMR döngüsü yeni bir MongoDB bağlantısı oluşturur ve bağlantı havuzu limitlerini hızla tüketir.

**Bozmanın sonucu:** Bağlantı havuzu tükenmesi, `"Unable to acquire lock"` hataları, dev sunucu çökmeleri.

### 4. `.env` Dosyası

Asla git'e commit'lenmemelidir. `.gitignore` deseni `.env*` ile korunur. Tüm secret'ları içerir.

**Sızmanın sonucu:** Tüm üçüncü parti servisler potansiyel olarak ele geçirilir.

### 5. AI Agent Kritik Dosyaları

| Dosya | Neden Kritik |
|-------|-------------|
| `lib/ai/tools.ts` | 18 tool tanımı + 5 savunma hattı. Zod şemalarının bozulması tüm AI fonksiyonlarını kırar |
| `lib/ai/prompts.ts` | System prompt + Router Agent kategorileri. Bu olmadan AI yanlış tool seçer |
| `lib/ai/message-format.ts` | **CanonicalMessage formatı** — 4 AI SDK formatını tek tipe normalize eder. Bozulursa tüm mesajlaşma kırılır |
| `lib/ai/tool-contracts.ts` | Tool çıktı Zod kontratları. UI bileşenleri bu şemalara bağlı |
| `lib/ai/tool-parser.ts` | Tool sonuç parser'ı. Bozulursa GenerativeUI hiçbir kartı render edemez |
| `lib/inngest/chat-async.ts` | **Asıl AI beyni.** generateText + DB kayıt + step güncellemeleri. Bozulursa AI yanıt vermez |
| `hooks/useChatManager.ts` | Paylaşımlı chat hook'u. İki UI (sayfa + floating) bu hook'a bağlı |
| `lib/constants/indicators.ts` | INDICATOR_REGISTRY — tüm indikatörlerin tek kaynak sabiti. System prompt buradan beslenir |

---

## Mimari Değişmezler

### Server Action Deseni

Tüm veri mutasyonları `lib/actions/` altındaki Server Actions üzerinden geçmelidir. Asla:
- Bir client component'tan doğrudan MongoDB çağırmayın
- Veritabanı kimlik bilgilerini client'a expose etmeyin
- Bir client component'tan server-side anahtarla Finnhub API'sini çağırmayın

### İndikatörler için Pure Functions

`lib/indicators/` altındaki tüm dosyalar saf matematiksel fonksiyonlar olarak kalmalıdır. Asla eklemeyin:
- Veritabanı çağrıları
- API istekleri
- Yan etkiler (loglama kabul edilebilir)
- React hook'ları veya bileşen import'ları

### AI Agent Mimari Değişmezleri

- **Streaming YOK:** `/api/chat` sadece jobId döner. AI işlemi Inngest worker'da asenkron çalışır
- **Polling:** Client 1.5sn aralıklarla jobId durumunu sorgular. Bu interval değiştirilmemeli (DB yükü artar)
- **CanonicalMessage:** Tüm mesaj formatı dönüşümleri `message-format.ts` üzerinden geçmeli. Doğrudan format manipülasyonu yapılmamalı
- **Component Registry:** Yeni tool kartı eklemek için `registry.tsx` → `TOOL_COMPONENT_MAP`'e 1 satır. Switch-case blokları eklenmemeli
- **Tool Contracts:** Her yeni tool çıktısı için `tool-contracts.ts`'e Zod schema eklenmeli. UI bileşenleri bu kontratlara bağlı

### Tip Tanımlama Konumu

Tüm paylaşılan tipler `types/global.d.ts` dosyasına gider (`declare global` kullanarak). Tipleri asla import etmeyin — global olarak kullanılabilirler.

---

## Rate Limitler & API Kısıtlamaları

| Limit | Nerede | Aşılırsa Etkisi |
|-------|--------|----------------|
| Finnhub: 60 istek/dk | Tüm Finnhub API çağrıları | Hisse verisi, arama, haberler sessizce başarısız olur |
| Gmail SMTP: 500 e-posta/gün (ücretsiz) | Nodemailer transport | Hoşgeldin e-postaları, haber özetleri, fiyat alarmları durur |
| Yahoo Finance: bilinmiyor/gayriresmi | Mum fallback | 4H mum birleştirme bozulur |
| Ollama: localhost, limitsiz | Lokal AI inference | CPU/GPU yetersizliğinde yavaşlama |
| Groq: ücretsiz tier limitli | Cloud AI inference (opsiyonel) | Rate limit aşımı |
| OpenRouter: kredi bazlı | Cloud AI inference (opsiyonel) | Kredi bitince hata |
| Inngest: platforma bağlı | Arkaplan iş yürütme | Cron job'lar çalışmaz |
| MongoDB Atlas: bağlantıya bağlı | Tüm veritabanı işlemleri | Başlangıçta uygulama çöker |

### Önbellek Stratejisi

`lib/actions/finnhub.actions.ts` içindeki `fetchJSON()` merkezi önbellek mekanizmasıdır.
Cache süreleri: haberler (300s), arama sonuçları (1800s), hisse profilleri (3600s), mumlar (600s), canlı fiyat (60s).

---

## Dosya Organizasyon Kuralları

| Ne | Nereye | Desen |
|-----|-------|------|
| Yeni indikatör | `lib/indicators/yeni.ts` | Pure function |
| Yeni indikatör grafiği | `components/charts/LightweightYeniChart.tsx` | lightweight-charts paneli |
| Yeni TA sayfası entegrasyonu | `app/(root)/ta/page.tsx` | Import, compute, sinyal, chart render |
| Yeni Server Action | `lib/actions/yeni.actions.ts` | `'use server'` direktifi, try-catch |
| Yeni AI Tool | `lib/ai/tools.ts` + `lib/ai/tool-contracts.ts` + `components/ai/registry.tsx` | Tool tanımı + Zod kontrat + kart bileşeni |
| Yeni AI kartı | `components/ai/YeniCard.tsx` + `registry.tsx`'e 1 satır | ToolCardProps interface'i |
| Yeni UI primitifi | `components/ui/` | `npx shadcn@latest add <component>` |
| Yeni tip | `types/global.d.ts` | `declare global` bloğu |
| Yeni env değişkeni | `.env` + [[deployment-env]]'i güncelle | Her iki yerde de dokümante et |

---

## Hata Yönetimi Konvansiyonları

- **Server Actions:** Her zaman try-catch ile sar, başarısızlıkta `{ success: false, error: string }` döndür
- **Finnhub çağrıları:** Başarısızlıkta boş array döndür (asla UI'a throw etme)
- **AI Tool'lar:** `toToolError()` kullan — `{ success: false, errorCode, userMessage, recoverable }`
- **Auth işlemleri:** Yakala ve yapılandırılmış hatalar döndür, dahili detayları asla client'a expose etme
- **Watchlist duplicate insert'leri:** Sessizce başarı say (`{ ok: true, added: true }`)

---

## Koordinasyon Gerektiren Breaking Change'ler

1. Yeni bir zorunlu env değişkeni eklemek → her geliştirici ve her ortamın güncellenmesi gerekir
2. Auth middleware matcher'ını değiştirmek → tüm korumalı route'ları etkiler
3. Veritabanı model şemalarını değiştirmek → migrasyon veya manuel koleksiyon güncellemeleri gerektirir
4. Better Auth konfigürasyonunu değiştirmek → mevcut oturumları geçersiz kılabilir
5. Finnhub'dan başka bir veri sağlayıcısına geçmek → tüm veri pipeline'ını etkiler
6. CanonicalMessage formatını değiştirmek → tüm mesajlaşma ve UI render'ı kırılır
7. `lib/ai/tools.ts`'deki Zod şemalarını değiştirmek → AI tool calling + UI kontratları bozulur
