# Proje Genel Bakış

> **Amaç:** Üst seviye proje tanımı, hedefler, kullanıcı kitlesi ve teknoloji yapısı.
> **Kapsam:** İş bağlamı, ürün tanımı, teknoloji yığını özeti, dış bağımlılıklar.
> **Ayrıca bakınız:** [[architecture]] (sistem tasarımı), [[deployment-env]] (konfigürasyon).
> **Son güncelleme:** 2026-05-22 (4-faz refactoring + 6 resilience katmanı + test altyapısı: vitest, 41 test)

---

## Ürün Özeti

**Signalist**, bireysel (perakende) yatırımcılar için tasarlanmış, profesyonel seviyede bir borsa takip ve teknik analiz web uygulamasıdır.

### Temel Özellikler

- TradingView grafik widget'ları ile canlı hisse senedi verisi takibi
- Canlı fiyat güncellemeli kişisel izleme listesi yönetimi
- Yapılandırılabilir fiyat alarmları (üst/alt eşik, günlük değerlendirme)
- 17 teknik indikatör + 3 formasyon aracı (toplam 20 analiz aracı)
- Özelleştirilebilir indikatör parametreleri
- Çoklu indikatör strateji birleştirme ve backtesting
- Tarihsel fraktal desen eşleştirme ile öngörü analizi
- Mum formasyonu tanıma (doji, hammer, engulfing, vb.)
- Destek & direnç seviyesi tespiti
- AI Agent (Qwen 3 14B) ile gerçek zamanlı finansal analiz — 18 tool, streaming yanıt
- Generative UI: Component Registry tabanlı dinamik arayüz (11 kart tipi, tüm tool'lar Structured UI)
- Inngest arka plan işlemleri ile brute-force parametre optimizasyonu + canlı ReasoningChain takibi
- Smart Title: AI tarafından otomatik sohbet başlığı üretimi
- Zustand tabanlı optimistic UI (watchlist anında güncelleme, global job tracking)
- 6 katmanlı resilience (polling loop, onError toast, network detection, double submit lock, server error classification, stable roomKey)
- Otomatik test altyapısı (vitest, 41 test, `npm test`)
- Google Gemini AI ile günlük piyasa haber özeti e-postaları
- Kayıt sonrası kişiselleştirilmiş hoşgeldin e-postaları
- Dark-mode UI (Radix UI + Tailwind CSS v4 tabanlı)

### Hedef Kitle

TradingView Premium gibi ücretli platformlarda bulunan profesyonel teknik analiz araçlarına
ücretsiz bir web uygulaması üzerinden erişmek isteyen bireysel yatırımcılar.

### Uygulama Tipi

Next.js App Router kullanan, varsayılan render stratejisi olarak Server Components tercih eden
full-stack bir SPA. Client Components yalnızca etkileşim gerektiren yerlerde kullanılır
(formlar, komut paletleri, grafikler).

---

## Teknoloji Yığını

| Katman | Teknoloji | Versiyon | Notlar |
|--------|-----------|----------|--------|
| Framework | Next.js | 16.0.3 | App Router + Turbopack |
| UI Kütüphanesi | React | 19.2.0 | React Compiler aktif |
| Dil | TypeScript | 5.x | strict mod |
| CSS | Tailwind CSS | v4 | PostCSS eklentisi ile |
| UI Bileşenleri | Radix UI + shadcn/ui | — | new-york stili, lucide-react ikonlar |
| Veritabanı | MongoDB | — | Mongoose ODM v9.0.0 |
| Auth | Better Auth | 1.4.1 | Email/şifre, MongoDB adapter |
| Formlar | react-hook-form | 7.66.1 | Client-side form yönetimi |
| Grafikler (özel) | lightweight-charts | 4.2.0 | TradingView'ün açık kaynak grafik kütüphanesi |
| Grafikler (gömülü) | TradingView Widget'ları | — | Standart görünümler için iframe widget'lar |
| Arkaplan İşleri | Inngest | 4.3.0 | Cron zamanlama + event-driven iş akışları |
| E-posta | Nodemailer | 7.0.10 | Gmail SMTP transport |
| AI (Agent) | Qwen 3 14B + Vercel AI SDK v6 | ^6.0.185 | Ollama + @ai-sdk/openai-compatible. 18 tool, 5 savunma hattı |
| AI (E-posta) | Google Gemini | gemini-2.5-flash-lite | Inngest AI plugin üzerinden |
| Global State | Zustand | — | activeJobs, watchlist, activeIndicators |
| Test Runner | Vitest | v4 | 41 test, 4 test dosyası, `npm test` |
| Hisse Verisi (birincil) | Finnhub API | — | Hisse fiyatı, mum, haber, arama, profil |
| Hisse Verisi (yedek) | Yahoo Finance | — | Mum verisi fallback'i (gayriresmi endpoint) |

### Versiyon Notları

- **React Compiler:** `next.config.ts` içinde `reactCompiler: true` ile aktif. `useMemo`/`useCallback` ihtiyacını büyük ölçüde ortadan kaldırır.
- **Tailwind CSS v4:** Geleneksel `tailwind.config.ts` yok. tema değişkenleri `app/globals.css` içinde `@theme inline {}` bloğunda tanımlı.
- **shadcn/ui:** `components.json` ile yapılandırılmış. Yeni bileşen eklemek için: `npx shadcn@latest add <component>`

---

## Dış API'ler

| API | Amaç | Kimlik Doğrulama |
|-----|------|------------------|
| **Finnhub** | Hisse arama, OHLC mumları, canlı fiyat, şirket profilleri, piyasa haberleri | API anahtarı `token` query parametresi olarak |
| **Yahoo Finance** (gayriresmi) | Mum verisi fallback'i (`/v8/finance/chart`). 1H aralığı 4H mumlarını oluşturmak için kullanılır | Yok |
| **TradingView Widget'ları** | Dashboard ve hisse detay sayfaları için gömülü iframe grafikler | Yok (ücretsiz embed script'leri) |
| **Google Gemini** | AI ile hoşgeldin e-postaları ve günlük haber özetleri oluşturma | Inngest AI plugin üzerinden API anahtarı |
| **Gmail SMTP** | Giden e-posta teslimatı (Nodemailer transport) | E-posta + Uygulama Şifresi |
| **Inngest** | Arkaplan iş yürütme ve cron zamanlama (dev mode: local, production: Inngest Cloud) | İsteğe bağlı Cloud API anahtarı |

### Finnhub Rate Limit

Ücretsiz tier: 60 istek/dakika. Tüm Finnhub API çağrıları `fetchJSON()` ([lib/actions/finnhub.actions.ts](lib/actions/finnhub.actions.ts)) üzerinden geçer.
Bu fonksiyon, Next.js built-in fetch cache mekanizmasını yapılandırılabilir `revalidate` aralıklarıyla kullanarak limitin altında kalmayı sağlar.

### Veri Fallback Zinciri

```
Hisse mumları:   Finnhub /stock/candle  →  Yahoo Finance /v8/finance/chart
Hisse haberleri: Şirkete özel haberler  →  Genel piyasa haberleri
```

### Önbellek Stratejisi

`fetchJSON()` için kullanılan `revalidate` süreleri:

| Veri Tipi | Revalidate | Açıklama |
|-----------|-----------|----------|
| Haberler | 300s (5 dk) | Sık güncellenir, kısa önbellek |
| Arama sonuçları | 1800s (30 dk) | Sembol aramaları nadiren değişir |
| Şirket profilleri | 3600s (1 saat) | Statik şirket bilgileri |
| Günlük mumlar | 600s (10 dk) | Finnhub + Yahoo fallback |
| Canlı fiyat (quote) | 60s (1 dk) | Sadece alert değerlendirmede kullanılır |

---

## Proje Kökeni

Tek geliştiricili full-stack proje olarak inşa edilmiştir. GitHub üzerinden işbirliğine uygun şekilde tasarlanmıştır.
`.env` dosyası versiyon kontrolünden hariçtir (`.gitignore` deseni: `.env*`) —
her geliştirici kendi yerel ortam konfigürasyonunu yönetir.
