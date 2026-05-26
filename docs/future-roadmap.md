# Gelecek Yol Haritası

> **Amaç:** Genişleme desenleri, yeni özelliklerin nasıl ekleneceği, ölçekleme fikirleri ve planlanan iyileştirmeler.
> **Kapsam:** Projeyi genişletmek için geliştirme rehberi.
> **Ayrıca bakınız:** [[technical-analysis]], [[architecture]], [[rules-critical]]
> **Son güncelleme:** 2026-05-25 (AI tool ekleme süreci güncellendi, yeni dosya yolları)

---

## Yeni Bir Teknik İndikatör Ekleme

### Yeni İndikatör Ekleme (10 Adım)

1. **Pure Function** (`lib/indicators/yeni_indikator.ts`) — Matematik hesaplaması, yan etkisiz
2. **INDICATOR_REGISTRY** (`lib/constants/indicators.ts`) — `{ key, name, optimizable }` girişi ekle
3. **Compute** (`lib/ta/compute.ts`) — if-block ekle, compute fonksiyonunu çağır
4. **Signals** (`lib/ta/signals.ts`) — if-block ekle, sinyal üret
5. **Types** (`lib/ta/types.ts`) — Parametre alanı ekle
6. **Optimizer** (opsiyonel, `lib/ta/optimizer.ts`) — `OPTIMIZABLE_INDICATORS`'a ekle
7. **Chart** (`components/charts/LightweightYeniChart.tsx`) — Canvas chart bileşeni
8. **TA Page** (`app/(root)/ta/page.tsx`) — `next/dynamic` import + render
9. **Hook** (`hooks/useTAIndicatorParams.ts`) — Varsayılan parametre
10. **Settings UI** (`components/ta/TAIndicatorSettings.tsx`) — Ayar formu

```typescript
// Pure function olmalı — yan etki, API çağrısı, DB erişimi OLMAYACAK
export function computeYeniIndikator(
  candles: { time: UTCTimestamp; close: number; high: number; low: number; volume?: number }[],
  param1: number
): YeniIndikatorPoint[] {
  // Saf matematik hesaplaması burada
}
```

---

## Yeni Bir AI Tool Ekleme

### AI Tool Ekleme (4 Adım)

1. **Tool Tanımı** (`lib/ai/tools.ts`) — `tool({ description, inputSchema, execute })` ile yeni tool ekle
2. **Output Contract** (`lib/ai/tool-contracts.ts`) — Zod schema ekle (UI bileşenleri bu kontrata bağlı)
3. **Kart Bileşeni** (`components/ai/YeniCard.tsx`) — `ToolCardProps` interface'ini implemente et
4. **Registry Kaydı** (`components/ai/registry.tsx`) — `TOOL_COMPONENT_MAP`'e 1 satır: `yeniTool: { component: YeniCard, outputSchema: YeniOutput, dataKey: '...' }`

Tool kategorisi seçimi:
- `[TA_TOOLS]` — Anlık durum sorguları (fiyat, indikatör)
- `[RESEARCH_TOOLS]` — Analiz/araştırma (backtest, optimizasyon)
- `[USER_TOOLS]` — Kullanıcı aksiyonları (watchlist, alarm)
- `[SYSTEM]` — Sistem tool'ları (clarification)

---

## Yeni Bir Inngest Fonksiyonu Ekleme

`lib/inngest/functions.ts` (veya yeni bir dosya) içinde:

```typescript
export const yeniFonksiyon = inngest.createFunction(
  { id: 'yeni-job', retries: 0 },
  [{ event: 'app/yeni-event' }],  // veya { cron: '0 9 * * *' }
  async ({ event, step }) => {
    const data = await step.run('adim-adi', async () => {
      // Çalışma burada
    });
    return { success: true };
  }
);
```

`app/api/inngest/route.ts` içindeki `functions` array'ine kaydedin:
```typescript
functions: [..., yeniFonksiyon],
```

---

## Yeni Bir Sayfa Ekleme

1. Dizini oluşturun: `app/(root)/yeni-ozellik/page.tsx`
2. Auth koruması gerekiyorsa zaten korumalıdır — `(root)` route grubu layout üzerinden kimlik doğrulama gerektirir
3. Public bir sayfa ise `app/(auth)/` altında veya middleware exclusion ile root seviyesinde oluşturun
4. `components/layout/NavItems.tsx` ve `lib/constants/index.ts → NAV_ITEMS` içine navigasyon linki ekleyin

---

## Yeni Bir UI Bileşeni Ekleme

shadcn/ui primitifleri için:
```bash
npx shadcn@latest add <bilesen-adi>
```

Özel bileşenler için: mevcut adlandırma desenlerini takip ederek `components/` altında oluşturun.

---

## Yeni Bir Ortam Değişkeni Ekleme

1. Yerel `.env` dosyanıza ekleyin
2. [[deployment-env#Ortam Değişkenleri]] tablosunu güncelleyin
3. Kullanım noktasında doğrulama/fallback ekleyin
4. Eğer bir secret ise (API anahtarı, şifre), sadece sunucu tarafı `process.env` kullanın (`NEXT_PUBLIC_` prefix'i YOK)

---

## Ölçekleme Değerlendirmeleri

### Mevcut Limitasyonlar

| Alan | Limitasyon | Giderme Yolu |
|------|-----------|-------------|
| Finnhub ücretsiz tier | Tüm kullanıcılar arasında paylaşılan 60 istek/dk | Ücretli plana yükselt veya Redis önbellek katmanı ekle |
| MongoDB Atlas ücretsiz tier | 512MB depolama, paylaşımlı RAM | Dedicated cluster'a yükselt |
| Inngest ücretsiz tier | Limitli step yürütme dakikası | Kullanımı izle, gerektikçe yükselt |
| Gmail SMTP | 500 e-posta/gün | Ölçek için SendGrid/Mailgun'a geç |
| Ollama (lokal) | CPU/GPU sınırlı, production'da yetersiz | Groq veya OpenRouter API'ye geç |
| Hata takibi yok | Production'da sessiz başarısızlıklar | Sentry veya benzeri ekle |
| Analitik yok | Kullanım görünürlüğü yok | PostHog veya benzeri ekle |
| Yahoo Finance bağımlılığı | Gayriresmi, SLA yok | Ücretli veri sağlayıcısı düşün (Polygon, Alpha Vantage) |

### Test Altyapısı

**Durum:** ✅ **Kuruldu.** Vitest v4, 41 test, 4 test dosyası.

Yeni test eklemek için: `dosya.test.ts` oluştur, `describe`/`it`/`expect` yaz, `npm test` ile çalıştır.
Mevcut testler: `lib/validations/`, `lib/indicators/rsi`, `lib/ta/backtest`, `lib/ai/error-codes`.

Genişleme alanları: `lib/indicators/` (16 indikatör daha), `lib/ta/signals.ts`, `lib/ai/tool-parser.ts`, `lib/ai/message-format.ts`, `lib/ai/tool-contracts.ts`.

### Performans Optimizasyonu Fırsatları

- **Hisse sayfaları için ISR:** `/stocks/AAPL` gibi sayfalar, tamamen dinamik render yerine Incremental Static Regeneration kullanabilir
- **Redis önbellekleme:** Finnhub çağrıları ile uygulama arasında bir Redis katmanı, API rate limit baskısını azaltır
- **İndikatör hesaplama önbelleği:** Aynı parametrelerle sık hesaplanan indikatör değerleri memoize edilebilir
- **Client-side veri çekme:** İzleme listesi fiyat güncellemeleri için SWR veya React Query

### Özellik Genişletme Fikirleri

- **Gerçek zamanlı WebSocket fiyatları:** Canlı fiyat güncellemeleri için polling yerine Finnhub WebSocket
- **Portföy takibi:** Kullanıcının gerçek pozisyonlarını, maliyet bazını, K/Z'yi takip etme
- **Çoklu zaman dilimi analizi:** Eşzamanlı 1D/4H/1W indikatör karşılaştırması
- **Alarm kanalları:** E-postaya ek olarak push bildirimleri, SMS, Slack webhook
- **Sosyal özellikler:** Paylaşımlı izleme listeleri, topluluk stratejileri, sinyal paylaşımı
- **Mobil PWA:** Mobil uygulama benzeri deneyim için PWA manifest ve service worker ekleme
- **Backtest export:** Backtest sonuçlarının CSV/PDF export'u
- **Screener:** İndikatör koşullarına göre çoklu sembol tarama
- **WebSocket AI streaming:** Inngest polling yerine gerçek zamanlı AI yanıt akışı (teknik zorluk: OpenRouter 524 timeout)
