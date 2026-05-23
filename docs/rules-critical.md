# Kritik Kurallar & Uyarılar

> **Amaç:** Asla gelişigüzel değiştirilmemesi gereken dosyalar ve sistemler, mimari değişmezler, rate limitler ve tehlikeli işlemler.
> **Kapsam:** Proje çapında kritik yollar.
> **Ayrıca bakınız:** [[architecture]], [[database]], [[deployment-env]]
> **Son güncelleme:** 2026-05-22 (dosya yolu güncellemeleri + yeni kritik dosyalar)

---

## Değiştirilmemesi Gerekenler (Tam Anlaşılmadan)

### 1. Middleware Matcher (`middleware/index.ts`)

```typescript
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|sign-in|sign-up|assets).*)'],
};
```

**Neden:** Bu regex hangi route'ların kimlik doğrulama gerektirdiğini kontrol eder. Tek bir karakter değişikliği, tüm uygulamayı kullanıcılara kilitleyebilir veya korumalı route'ları kimlik doğrulamasız erişime açabilir. Desen şunları açıkça hariç tutar: API route'ları, statik asset'ler, görseller, favicon, auth sayfaları ve public asset'ler.

**Bozmanın sonucu:** Tüm route koruması kaybolur veya uygulama tamamen erişilemez hale gelir.

### 2. Better Auth Singleton (`lib/better-auth/auth.ts`)

```typescript
let authInstance: ReturnType<typeof betterAuth> | null = null;

export const getAuth = async () => {
  if (authInstance) return authInstance;
  // ... instance oluştur ve önbelleğe al
};

export const auth = await getAuth();  // Top-level await
```

**Neden:** Better Auth tam olarak bir instance gerektirir. Top-level `await getAuth()` teknik olarak anti-pattern'dir ancak Better Auth'ün Next.js entegrasyonu tarafından zorunlu kılınır. Singleton kontrolünü veya top-level await'i kaldırmak memory leak'lere veya auth hatalarına yol açar.

**Bozmanın sonucu:** Birden fazla auth instance'ı, memory leak'ler, oturum bozulması.

### 3. MongoDB Bağlantı Önbelleği (`database/mongoose.ts`)

```typescript
let cached = global.mongooseCache;
if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}
```

**Neden:** Next.js hot module replacement, geliştirme sırasında modülleri sık sık yeniden çalıştırır. Global önbellek olmadan her HMR döngüsü yeni bir MongoDB bağlantısı oluşturur ve bağlantı havuzu limitlerini hızla tüketir. `global.mongooseCache`, `globalThis` kalıcı olduğu için HMR'den sağ çıkar.

**Bozmanın sonucu:** Bağlantı havuzu tükenmesi, `"Unable to acquire lock"` hataları, dev sunucu çökmeleri.

### 4. `.env` Dosyası

Asla git'e commit'lenmemelidir. `.gitignore` deseni `.env*` ile korunur. Tüm secret'ları içerir (MongoDB şifresi, API anahtarları, auth secret'ı, e-posta kimlik bilgileri).

**Sızmanın sonucu:** Tüm üçüncü parti servisler potansiyel olarak ele geçirilir. MongoDB verileri açığa çıkar. E-posta hesabı ele geçirilir.

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

### Tip Tanımlama Konumu

Tüm paylaşılan tipler `types/global.d.ts` dosyasına gider (`declare global` kullanarak). Tipleri asla import etmeyin — global olarak kullanılabilirler. Bu bir TypeScript zorunluluğu değil, proje konvansiyonudur.

---

## Rate Limitler & API Kısıtlamaları

| Limit | Nerede | Aşılırsa Etkisi |
|-------|--------|----------------|
| Finnhub: 60 istek/dk | Tüm Finnhub API çağrıları | Hisse verisi, arama, haberler sessizce başarısız olur |
| Gmail SMTP: 500 e-posta/gün (ücretsiz) | Nodemailer transport | Hoşgeldin e-postaları, haber özetleri, fiyat alarmları durur |
| Yahoo Finance: bilinmiyor/gayriresmi | Mum fallback | 4H mum birleştirme bozulur, Finnhub da kapalıysa fallback yok |
| Inngest: platforma bağlı | Arkaplan iş yürütme | Cron job'lar (haberler, alarmlar) çalışmaz |
| MongoDB Atlas: bağlantıya bağlı | Tüm veritabanı işlemleri | Başlangıçta uygulama çöker |

### Önbellek Stratejisi

`lib/actions/finnhub.actions.ts` içindeki `fetchJSON()` merkezi önbellek mekanizmasıdır:
- `revalidateSeconds` ile: Next.js `fetch`'i `cache: 'force-cache'` + `next: { revalidate: N }` ile kullanır
- `revalidateSeconds` olmadan: `cache: 'no-store'` kullanır

Cache süreleri: haberler (300s), arama sonuçları (1800s), hisse profilleri (3600s), mumlar (600s), canlı fiyat (60s - sadece Inngest alert değerlendirmede).

---

## Dosya Organizasyon Kuralları

Yeni kod eklerken bu konvansiyonları takip edin:

| Ne | Nereye | Desen |
|-----|-------|------|
| Yeni indikatör | `lib/indicators/yeni.ts` | Pure function, compute fonksiyonu export et |
| Yeni indikatör grafiği | `components/LightweightYeniChart.tsx` | lightweight-charts paneli |
| Yeni TA sayfası entegrasyonu | `app/(root)/ta/page.tsx` | Import, compute çağrısı, sinyal mantığı, chart render bloğu ekle |
| Yeni Server Action | `lib/actions/yeni.actions.ts` | `'use server'` direktifi, try-catch sarmalayıcı |
| Yeni UI primitifi | `components/ui/` | `npx shadcn@latest add <component>` kullan |
| Yeni tip | `types/global.d.ts` | `declare global` bloğu |
| Yeni env değişkeni | `.env` + [[deployment-env]]'i güncelle | Her iki yerde de dokümante et |

---

## Hata Yönetimi Konvansiyonları

- **Server Actions:** Her zaman try-catch ile sar, başarısızlıkta `{ success: false, error: string }` döndür
- **Finnhub çağrıları:** Başarısızlıkta boş array döndür (asla UI'a throw etme)
- **Auth işlemleri:** Yakala ve yapılandırılmış hatalar döndür, dahili detayları asla client'a expose etme
- **Watchlist duplicate insert'leri:** Sessizce başarı say (`{ ok: true, added: true }`)

---

## Koordinasyon Gerektiren Breaking Change'ler

1. Yeni bir zorunlu env değişkeni eklemek → her geliştirici ve her ortamın güncellenmesi gerekir
2. Auth middleware matcher'ını değiştirmek → tüm korumalı route'ları etkiler
3. Veritabanı model şemalarını değiştirmek → migrasyon veya manuel koleksiyon güncellemeleri gerektirir
4. Better Auth konfigürasyonunu değiştirmek → mevcut oturumları geçersiz kılabilir
5. Finnhub'dan başka bir veri sağlayıcısına geçmek → tüm veri pipeline'ını etkiler
