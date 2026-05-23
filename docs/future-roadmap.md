# Gelecek Yol Haritası

> **Amaç:** Genişleme desenleri, yeni özelliklerin nasıl ekleneceği, ölçekleme fikirleri ve planlanan iyileştirmeler.
> **Kapsam:** Projeyi genişletmek için geliştirme rehberi.
> **Ayrıca bakınız:** [[technical-analysis]], [[architecture]], [[rules-critical]]
> **Son güncelleme:** 2026-05-22 (INDICATOR_REGISTRY + yeni dosya yolları + 10 adımlı indikatör ekleme süreci)

---

## Yeni Bir Teknik İndikatör Ekleme

### Yeni İndikatör Ekleme (10 Adım)

> **2026-05-22 güncelleme:** `lib/constants/indicators.ts` içindeki `INDICATOR_REGISTRY` artık tüm indikatörlerin tek kaynak sabitidir. Yeni bir indikatör eklemek için buraya 1 satır eklemeniz yeterlidir — system prompt otomatik güncellenir.

1. **Pure Function** (`lib/indicators/yeni_indikator.ts`) — Matematik hesaplaması, yan etkisiz
2. **INDICATOR_REGISTRY** (`lib/constants/indicators.ts`) — `{ key, name, optimizable }` girişi ekle
3. **Compute** (`lib/ta/compute.ts`) — if-block ekle, compute fonksiyonunu çağır
4. **Signals** (`lib/ta/signals.ts`) — if-block ekle, sinyal üret
5. **Types** (`lib/ta/types.ts`) — Parametre alanı ekle
6. **Optimizer** (opsiyonel, `lib/ta/optimizer.ts`) — `OPTIMIZABLE_INDICATORS`'a ekle
7. **Chart** (`components/charts/Lightweight*.tsx`) — Canvas chart bileşeni
8. **TA Page** (`app/(root)/ta/page.tsx`) — `next/dynamic` import + render
9. **Hook** (`hooks/useTAIndicatorParams.ts`) — Varsayılan parametre
10. **Settings UI** (`components/ta/TAIndicatorSettings.tsx`) — Ayar formu

```typescript
// Pure function olmalı — yan etki, API çağrısı, DB erişimi OLMAYACAK
export type YeniIndikatorPoint = {
  time: UTCTimestamp;
  value: number;
  // gereken ek alanlar
};

export function computeYeniIndikator(
  candles: { time: UTCTimestamp; close: number; high: number; low: number; volume?: number }[],
  param1: number,
  param2: number
): YeniIndikatorPoint[] {
  // Saf matematik hesaplaması burada
  // Giriş mumlarıyla hizalı array döndür
}
```

### Adım 2: Chart Bileşeni (`components/LightweightYeniIndikatorChart.tsx`)

```typescript
// lightweight-charts kütüphanesini kullan
// Hesaplanmış veriyi props olarak al
// Mevcut chart desenlerini takip eden bağımsız bir chart paneli render et
// LightweightRSIChart.tsx veya LightweightMACDChart.tsx'teki deseni örnek al
```

### Adım 3: TA Sayfası Entegrasyonu (`app/(root)/ta/page.tsx`)

Dört blok ekleyin:
1. **Import** — compute fonksiyonunu ve chart bileşenini
2. **URL parametrelerini oku** — özel parametreler için (örn. `yeniind_len`)
3. **Hesapla** — `if (candles.length > 0)` bloğunda indikatör verisini
4. **Sinyal mantığı** — `addSignal("yeniind", label)` kullanarak
5. **Render** — koşullu chart bloğu: `{activeIndicators.has('yeniind') && yeniindData && (...)`

### Adım 4: Backtest Entegrasyonu (`lib/backtest-utils.ts`)

`calculateWinRate()` içine `else if (indicatorName === "YENIIND" ...)` dalı ekleyin.

### Adım 5: Optimizer (opsiyonel, `lib/optimizer-utils.ts`)

`OPTIMIZABLE_INDICATORS`'a param adı, aralık, compute fonksiyonu ve formatter ile bir giriş ekleyin.

### Adım 6: İndikatör Buton Listesine Ekle (`components/TAIndicatorsButton.tsx`)

Yeni indikatör adını checkbox listesi UI'ına ekleyin.

---

## Yeni Bir Inngest Cron Job Ekleme

`lib/inngest/functions.ts` içinde:

```typescript
export const yeniCronFonksiyonu = inngest.createFunction(
  { id: 'yeni-job' },
  [{ cron: '0 9 * * *' }],  // Cron ifadesi
  async ({ step }) => {
    // Otomatik retry'li step bazlı yürütme
    const data = await step.run('adim-adi', async () => {
      // Çalışma burada
    });
    return { success: true };
  }
);
```

`app/api/inngest/route.ts` içindeki `functions` array'ine kaydedin:
```typescript
functions: [sendSignUpEmail, sendDailyNewsSummary, evaluateDailyPriceAlerts, yeniCronFonksiyonu],
```

---

## Yeni Bir Sayfa Ekleme

1. Dizini oluşturun: `app/(root)/yeni-ozellik/page.tsx`
2. Auth koruması gerekiyorsa zaten korumalıdır — `(root)` route grubu layout üzerinden kimlik doğrulama gerektirir
3. Public bir sayfa ise `app/(auth)/` altında veya middleware exclusion ile root seviyesinde oluşturun
4. `components/NavItems.tsx` ve `lib/constants.ts → NAV_ITEMS` içine navigasyon linki ekleyin

---

## Yeni Bir UI Bileşeni Ekleme

shadcn/ui primitifleri için:
```bash
npx shadcn@latest add <bilesen-adi>
```
Bu, `components/ui/` altına otomatik oluşturur.

Özel bileşenler için: mevcut adlandırma desenlerini takip ederek `components/` altında oluşturun.

---

## Yeni Bir Ortam Değişkeni Ekleme

1. Yerel `.env` dosyanıza ekleyin
2. [[deployment-env#Ortam Değişkenleri]] tablosunu güncelleyin
3. Kullanım noktasında doğrulama/fallback ekleyin (`database/mongoose.ts` veya `lib/actions/finnhub.actions.ts` içindeki mevcut desenleri takip edin)
4. Tüm ekip üyelerine değişkeni kendi `.env`'lerine eklemelerini bildirin
5. Eğer bir secret ise (API anahtarı, şifre), sadece sunucu tarafı `process.env` kullanın (`NEXT_PUBLIC_` prefix'i YOK)

---

## Ölçekleme Değerlendirmeleri

### Mevcut Limitasyonlar

| Alan | Limitasyon | Giderme Yolu |
|------|-----------|-------------|
| Finnhub ücretsiz tier | Tüm kullanıcılar arasında paylaşılan 60 istek/dk | Ücretli plana yükselt veya Redis önbellek katmanı ekle |
| MongoDB Atlas ücretsiz tier | 512MB depolama, paylaşımlı RAM | Dedicated cluster'a yükselt |
| Inngest ücretsiz tier | Limitli step yürütme dakikası | Kullanımı izle, gerektikçe yükselt |
| Gmail SMTP | 500 e-posta/gün | Ölçek için SendGrid/Mailgun'a geç |
| Hata takibi yok | Production'da sessiz başarısızlıklar | Sentry veya benzeri ekle |
| Analitik yok | Kullanım görünürlüğü yok | PostHog veya benzeri ekle |
| Yahoo Finance bağımlılığı | Gayriresmi, SLA yok | Ücretli veri sağlayıcısı düşün (Polygon, Alpha Vantage) |

### Test Altyapısı

**Durum:** ✅ **Kuruldu** (2026-05-22). Vitest v4, 41 test, 4 test dosyası.

Yeni test eklemek için: `dosya.test.ts` oluştur, `describe`/`it`/`expect` yaz, `npm test` ile çalıştır.
Mevcut testler: `lib/validations/`, `lib/indicators/rsi`, `lib/ta/backtest`, `lib/ai/error-codes`.

Genişleme alanları: `lib/indicators/` (16 indikatör daha), `lib/ta/signals.ts`, `lib/ai/tool-parser.ts`, `lib/ta/compute.ts`.

### Performans Optimizasyonu Fırsatları

- **Hisse sayfaları için ISR:** `/stocks/AAPL` gibi sayfalar, tamamen dinamik render yerine Incremental Static Regeneration ve revalidate penceresi kullanabilir
- **Redis önbellekleme:** Finnhub çağrıları ile uygulama arasında bir Redis katmanı, API rate limit baskısını azaltır
- **İndikatör hesaplama önbelleği:** Aynı parametrelerle sık hesaplanan indikatör değerleri memoize edilebilir
- **Client-side veri çekme:** İzleme listesi fiyat güncellemeleri, sunucu yeniden render'ları olmadan gerçek zamanlı his için SWR veya React Query kullanabilir

### Özellik Genişletme Fikirleri

- **Gerçek zamanlı WebSocket fiyatları:** Canlı fiyat güncellemeleri için polling yerine Finnhub WebSocket
- **Portföy takibi:** Kullanıcının gerçek pozisyonlarını, maliyet bazını, K/Z'yi takip etme
- **Çoklu zaman dilimi analizi:** Eşzamanlı 1D/4H/1W indikatör karşılaştırması
- **Alarm kanalları:** E-postaya ek olarak push bildirimleri, SMS, Slack webhook
- **Sosyal özellikler:** Paylaşımlı izleme listeleri, topluluk stratejileri, sinyal paylaşımı
- **Mobil PWA:** Mobil uygulama benzeri deneyim için PWA manifest ve service worker ekleme
- **Backtest export:** Backtest sonuçlarının CSV/PDF export'u
- **Screener:** İndikatör koşullarına göre çoklu sembol tarama
- **AI Agent (Finansal Asistan):** Teknik analiz motoruna doğrudan erişebilen agentic AI — detaylı tasarım için bkz. [[ai-agent-architecture]]
