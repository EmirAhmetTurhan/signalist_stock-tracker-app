# Frontend

> **Amaç:** App Router yapısı, route grupları, UI bileşen kataloğu ve client-side desenler.
> **Kapsam:** `app/`, `components/`, `hooks/`, `types/` altındaki tüm dosyalar.
> **Ayrıca bakınız:** [[architecture]], [[backend]], [[technical-analysis]], [[ai-agent-architecture]]
> **Son güncelleme:** 2026-05-25 (6 Fazlı AI Kararlılık Revizyonu: Message Pipeline, Component Registry, Background Loop, ToolProgress, Hydration, Error Visibility. CanonicalMessage + tool-contracts + useChatManager entegrasyonu)

---

## App Router Yapısı

```
app/
├── layout.tsx                    # Root layout: <html dark>, Geist font, Toaster
├── globals.css                   # Tailwind v4 import + özel CSS (tema değişkenleri)
├── favicon.ico
├── (auth)/                       # Oturumsuz route grubu
│   ├── layout.tsx                # Session varsa '/' adresine yönlendirir
│   ├── sign-in/page.tsx          # Giriş formu (client component)
│   └── sign-up/page.tsx          # Kayıt formu (client component)
├── (root)/                       # Oturumlu route grubu
│   ├── layout.tsx                # Session kontrolü + Header render'ı
│   ├── page.tsx                  # Dashboard (4 TradingView widget'ı)
│   ├── stocks/[symbol]/page.tsx  # Hisse detayı (6 TradingView widget'ı)
│   ├── stocks/[symbol]/alert/page.tsx  # Hisseye özel fiyat alarmı oluşturma
│   ├── ta/
│   │   ├── page.tsx               # Teknik Analiz (484 satır, lib/ta/ delegasyonlu)
│   │   └── loading.tsx            # Suspense loading state
│   ├── ai/page.tsx                # AI Agent tam sayfa sohbet (ChatGPT benzeri)
│   ├── watchlist/page.tsx         # İzleme listesi tablosu + alarmlar paneli
│   └── alerts/create/page.tsx     # Alternatif alarm oluşturma sayfası
├── api/
│   ├── inngest/route.ts           # Inngest endpoint'i (GET, POST, PUT)
│   └── chat/route.ts              # AI Agent API endpoint (POST, Inngest Trigger + JSON)
```

### Route Group Mantığı

- **`(auth)/layout.tsx`:** `session.user` varsa → `redirect('/')`
- **`(root)/layout.tsx`:** `!session.user` varsa → `redirect('/sign-in')`; aksi halde `<Header user={user} />` + `{children}` render eder

---

## Bileşen Kataloğu

> **2026-05-22 Refactoring:** 13 kök dizin bileşeni alt dizinlere taşındı. `components/` kökü artık sadece alt dizinleri barındırır.

### UI Primitifleri (`components/ui/`)

shadcn/ui tarafından otomatik oluşturulmuş bileşenler: `button`, `dialog`, `dropdown-menu`, `input`, `label`, `select`, `popover`, `avatar`, `command`, `sonner` (toast).

Bu dosyalar elle düzenlenmemelidir — yeni bileşen eklemek için `npx shadcn@latest add <component>` kullanın.

### Form Bileşenleri (`components/forms/`)

| Bileşen | Amaç |
|---------|------|
| `InputField` | Validasyonlu genel metin/şifre/eposta girişi |
| `SelectField` | react-hook-form Controller ile dropdown seçim |
| `CountrySelectField` | Ülke seçici (`react-select-country-list` kullanır) |
| `FooterLink` | Auth form alt linkleri ("Hesabınız yok mu?" → Kaydol) |

### Layout & Navigasyon (`components/layout/`)

| Bileşen | Amaç |
|---------|------|
| `Header` | Üst çubuk: logo, `NavItems`, `SearchCommand`, `UserDropdown`, `NotificationBell` |
| `NavItems` | Dört navigasyon linki: Dashboard, Search, Watchlist, T/A |
| `UserDropdown` | Avatar + dropdown: profil düzenleme, çıkış |
| `SearchCommand` | ⌘K komut paleti — hisse arama (cmdk tabanlı, `next/dynamic` lazy-load) |
| `ErrorBoundary` | React Error Boundary — chart çökmelerinde sayfayı korur |
| `NotificationBell` | AI işlem bildirimleri + aktif job takibi (AIEngineProvider'dan beslenir) |
| `EditProfileModal` | Kullanıcı profil adı/resim düzenleme modal'ı |

### Watchlist Bileşenleri (`components/watchlist/`)

| Bileşen | Amaç |
|---------|------|
| `WatchlistButton` | İzleme listesine ekle/çıkar toggle |
| `WatchlistTable` | Sembol, fiyat, değişim, piyasa değeri sütunlu izleme listesi tablosu — canlı fiyat verisi ile |

### Alarm Bileşenleri (`components/alerts/`)

| Bileşen | Amaç |
|---------|------|
| `AlertActions` | Fiyat alarmları için düzenle/sil butonları |
| `AlertStockSelector` | Alarm oluşturma formu için hisse seçici |

### T/A Sayfası Bileşenleri (`components/ta/`)

| Bileşen | Amaç |
|---------|------|
| `TASearch` | Hisse sembolü seçici (komut paleti) |
| `TAIndicatorsButton` | İndikatörler için çoklu seçim dropdown |
| `TAIntervalButton` | Zaman aralığı toggle: 1D / 4H |
| `TAStrategiesButton` | Hazır strateji seçici (örn. RSI+CCI+WaveTrend) |
| `TAIndicatorSettings` | İndikatör parametre ayarları modal'ı (298 satır — state mantığı `useTAIndicatorParams` hook'una çıkarıldı). 17 indikatörün parametrelerini `ParamInput`, `SettingsSection` ve indikatör-özel alt bileşenlerle render eder |
| `TAIndicatorSettings` (alt) | `MacdSettings`, `StochRSISettings`, `RsiSettings`, `AlmaSettings` (Inputs/Style sekmeli), `BollingerSettings` (Inputs/Style sekmeli) — her biri kendi indikatör grubunun ayar formunu render eder |

### AI Agent Bileşenleri (`components/ai/`)

> Tüm AI bileşenleri `components/ai/` alt dizininde toplanmıştır (2026-05-22 refactoring).

| Bileşen | Amaç |
|---------|------|
| `FloatingChatButton` | Sağ-alt overlay sohbet paneli. **`next/dynamic` ile lazy-load**. `useChatManager` hook'u + DB hafıza. F5 yenilemelerinde chat'in kaybolmaması için aktif sohbet ID'sini `localStorage` (`signalist-active-conv`) içinde tutar. |
| `/ai` sayfası | Tam sayfa sohbet. **Sidebar:** konuşma listesi, yeni sohbet, pin/rename/delete, **activeJobs spinner (Loader2)**. URL routing (`?id=xxx`). **Multi-room:** `roomKey`/`convId` ayrımı → oda değişince useChat sıfırlanmaz |
| `ChatArea` (`React.memo`'lu) | `useChatManager` hook'u ile sadeleştirildi (~25 satır chat mantığı). `roomKey` ile mount, `convId` ile DB senkronizasyonu. DB hydration, lazy creation, auto-scroll (hook'tan gelir) |
| `GenerativeUI` (`React.memo`'lu) | Component Registry tabanlı (`TOOL_COMPONENT_MAP`). Hatalar için `detectErrorCode` ile şık `ErrorCard`'lar çizer. `isLast` + `onFollowUp` prop'ları. |
| `LiveAnalysisCard` | **1.5 saniye polling.** Inngest işlemlerini takip eder. Bittiğinde `useChatManager` üzerinden `addToolOutput` tetikleyerek UI'a ve DB'ye sonucu basar. |
| `AnalysisResultCard` | Statik yeşil sonuç kartı. Win Rate + Best Parameter grid + "View in Notebook" / "Apply to Chart" butonları |
| `ToolProgress` (`React.memo`'lu) | Tool invocation'ları canlı gösterir (spinner → checkmark/error). Uzun süren arka plan işlerinin hatalı "(Aborted)" uyarısı vermemesi için arka plan işleri bu barda gösterilmez. |
| `MarkdownRenderer` (`React.memo`'lu) | `react-markdown` + `remark-gfm` ile zengin Markdown render |
| `/notebook` sayfası | Research Notebook: arama, sembol filtresi, not kartları grid, detay modal |
| **Zustand Store** | `useAppStore` — `watchlist` (optimistic), `activeIndicators` (AI→TA), `lastToolAction` (log), `activeJobs: Record<convId, jobId>` (sidebar spinner) |
| **useChatManager** | `hooks/useChatManager.ts` | Paylaşımlı chat hook'u — Mesaj gönderme, 1.5s aralıklarla `jobId` durumunu (polling) takip etme ve sonuçlanınca MongoDB'den hidratasyon sağlama işlerini yürütür. Asenkron yapının merkezidir. |

### Component Registry Kartları (`components/ai/`) — yeni (2026-05-21)

**Mimari:** `TOOL_COMPONENT_MAP` — her tool ismi → React bileşeni eşlemesi. Yeni tool eklemek 1 satır. `getAllToolResults()` parser'ı ile normalize edilmiş veri → registry lookup → dinamik kart render.

| Bileşen | Hangi Tool'lar | Görsel |
|---------|---------------|--------|
| `ActionConfirmCard` | `addToWatchlist`, `removeFromWatchlist`, `createPriceAlert`, `deletePriceAlert`, `createSmartAlert` | Yeşil checkmark + "Added to watchlist: AAPL" |
| `PriceSnapshotCard` | `getCurrentPrice` | Büyük fiyat + yeşil/kırmızı değişim + Analyze/Details/Alert butonları |
| `IndicatorSignalsCard` | `analyzeIndicators` | BUY/SELL/CONFLICT rozetleri + Apply to TA Page + Run Backtest butonu |
| `SearchResultsCard` | `searchStock` | Arama sonuçları listesi (sembol + isim + ülke), boş state |
| `BacktestResultCard` | `runBacktest` | Win Rate + Total Signals grid + confidence rozeti + parameter bilgisi |
| `NewsListCard` | `getMarketNews` | 4 haber kartı (başlık + kaynak + tarih + external link), boş state |
| `WatchlistSummaryCard` | `getWatchlist` | Mini izleme listesi + sembol butonları + "View full watchlist" linki |
| `AlertListCard` | `getUserAlerts`, `getSmartAlerts` | Alarm listesi (sembol + eşik + tip + frekans), boş state |
| `IndicatorRankingCard` | `rankIndicators`, `findBestIndicator` | Sıralı indikatör listesi (win rate bar'ları) + Notebook butonu |
| `ClarificationForm` | `askClarification` | AI soru sorar: HelpCircle ikon + soru metni + quick-reply butonları + özel metin girişi + Send. Sadece son mesajda (`isLast`) |
| `ErrorCard` | **Tüm hatalı tool'lar** | Kırmızı kart: XCircle + AlertTriangle. Hata başlığı + kullanıcı dostu mesaj. 3 aksiyon: Retry, Check API Status, Search Stocks |
| `registry.tsx` | **Merkezi kayıt** | `TOOL_COMPONENT_MAP` + `getToolCard()` + `ClarificationCard` wrapper — tek noktadan yönetim |

**Kritik mimari detaylar (2026-05-19 güncel):**
- **Multi-room izolasyon (roomKey/convId ayrımı):** `useChat({ id: roomKey })` — roomKey sabit, useChat sıfırlanmaz. convId DB ID'si olup `convIdRef` üzerinden transport header'ına dinamik eklenir. Oda değişince unmount OLMAZ
- **Transport pattern (type-safe):** `DefaultChatTransport({ headers: (): Record<string, string> => ({...}) })` — `Resolvable<T>` tipi sayesinde `headers` fonksiyon olarak verilebilir. Her istekte `convIdRef.current` okunur. Custom `fetch` override'a gerek YOK
- **Lazy creation:** "New Chat" DB'ye kaydetmez, sadece UI açar. İlk mesajda `createConversation` çağrılır, `roomKey` korunur, `convId` güncellenir → ChatArea UNMOUNT OLMAZ
- **Cooling grace period:** İşlemi biten oda hemen DOM'dan kaldırılmaz, 5 saniye `coolingIds`'te tutulur → Veritabanına yazmayı tamamlar
- **Hydration:** Sadece `convId` değişince tetiklenir. DB boş dönse mevcut mesajlar korunur (`messages.length > 0` kontrolü). Loading skeleton gösterilir
- **Scroll:** `ResizeObserver` + `isAtBottomRef` — sadece kullanıcı en alttayken otomatik kayar. Yukarı çıkınca rahatsız etmez. Odaya dönünce işlem devam ediyorsa animasyon görünür
- **Performans:** `ChatArea` + tüm alt bileşenler `React.memo`'lu. localStorage sadece işlem bitince yazılır. `FloatingChatButton` `next/dynamic` ile lazy-load

### Hata Yönetimi (Resilience)

| Bileşen | Amaç |
|---------|------|
| `ErrorBoundary` | React Error Boundary (`'use client'` class component). TA sayfasındaki tüm chart alanını sarar |
| Offline Banner | Sarı uyarı: "Internet baglantisi kesildi" — `isOffline` state'i ile otomatik algılama |
| Error Banner | Kırmızı hata kartı: hata mesajı + "Sayfayi Yenile" butonu — `onError` toast ile birlikte |
| Loading Guard | Tool çağrısı aktifken bouncing dots gizlenir (çift animasyon önleme) |
| Double Submit Lock | `pendingRef` işlem bitene kadar ikinci gönderimi engeller |

### Lightweight Charts (`components/charts/`)

Her biri `lightweight-charts` kütüphanesi ile tek bir indikatör paneli render eder.
Toplam **17** chart bileşeni (ana grafik + 15 indikatör + TradingViewWidget).
**TA sayfasında 16 chart bileşeni `next/dynamic(() => import(...))` ile lazy-load edilir** — canvas tabanlı bileşenler SSR'da çalışmaz, hydration hatalarını önler ve ilk bundle boyutunu küçültür.

`LightweightCandleChart` (ana grafik — ALMA, Bollinger, Formasyon, Fraktal, S/R overlay'leri ile),
`LightweightMACDChart`, `LightweightRSIChart`, `LightweightStochRSIChart`,
`LightweightWaveTrendChart`, `LightweightDMIChart`, `LightweightMFIChart`,
`LightweightSMIChart`, `LightweightAOChart`, `LightweightCCIChart`,
`LightweightWPRChart`, `LightweightDIChart`, `LightweightCMFChart`,
`LightweightADChart`, `LightweightNetVolumeChart`, `LightweightMADRChart`.

### Analiz Panelleri (`components/panels/`)

| Bileşen | Amaç |
|---------|------|
| `CandlePatternPanel` | Tespit edilen mum formasyonlarını gösterir (doji, hammer, vb.) |
| `HistoricalFractalsPanel` | Tarihsel fraktal eşleşmeleri ve projeksiyon çizgisini gösterir |
| `SRPanel` | Tespit edilen destek & direnç seviyelerini gösterir |
| `BacktestMonitor` | İndikatör başına backtest win rate widget'ı |
| `StrategyBacktestMonitor` | Çoklu indikatör strateji backtest widget'ı (34KB) |
| `CustomStrategyPanel` | Özel strateji oluşturucu (indikatörler arası AND/OR mantığı) |
| `CustomStrategyModal` | Özel strateji konfigürasyon modal'ı (18KB) |

### Widget Bileşeni (`components/charts/`)

| Bileşen | Amaç |
|---------|------|
| `TradingViewWidget` | Genel TradingView iframe gömücü. `scriptUrl`, `config`, `height`, `className` parametreleri alır. Dashboard, hisse detayı ve TA sayfası fallback'inde kullanılır. `React.memo` ile optimize edilmiştir. |

---

## Özel Hook'lar

| Hook | Dosya | Amaç |
|------|-------|------|
| `useDebounce` | `hooks/useDebounce.ts` | Genel debounce (arama girişi için kullanılır) |
| `useTradingViewWidget` | `hooks/useTradingViewWidget.tsx` | TradingView widget yaşam döngüsü yönetimi (dinamik script yükleme) |
| `useTAIndicatorParams` | `hooks/useTAIndicatorParams.ts` (264 satır) | 17 indikatörün state yönetimi, URL parametre save/restore ve `handleSave` mantığı. `useCallback` optimize. `TAIndicatorSettings` bileşeninden çıkarıldı |

---

## Tip Sistemi

Tüm TypeScript tip tanımlamaları `types/global.d.ts` dosyasında `declare global` bloğu içinde tanımlanır
ve import gerektirmeden global olarak kullanılabilir.

Önemli tipler: `SignInFormData`, `SignUpFormData`, `User`, `Stock`, `StockWithWatchlistStatus`,
`StockWithData`, `CandleDataPoint`, `UTCTimestamp`, `MarketNewsArticle`, `RawNewsArticle`,
`FinnhubSearchResult`, `FinnhubSearchResponse`, `Alert`, `AlertData`, `QuoteData`,
`ProfileData`, `FinancialsData`, `WatchlistTableProps`, `SearchCommandProps`,
`WelcomeEmailData`.

Yeni bir global tip eklemek için: `types/global.d.ts` dosyasını düzenleyin, başka bir yerde import gerekmez.

---

## Sayfa: Dashboard (`(root)/page.tsx`)

Server component. 4 TradingView iframe widget'ını 2×2 grid'de render eder:
1. **Market Overview** — Sembol sekmeli (Financial, Technology, Services), 12 aylık mini grafikler
2. **Stock Heatmap** — SPX500, piyasa değeri blokları, sektör gruplaması
3. **Top Stories** — Piyasa haberleri zaman akışı
4. **Market Data** — Sembol fiyat tablosu

Tüm widget konfigürasyonları `lib/constants/widgets.ts` içindedir. `lib/constants/index.ts` barrel re-export ile geriye dönük uyumlu.

---

## Sayfa: Hisse Detayı (`(root)/stocks/[symbol]/page.tsx`)

Server component. İki sütunlu düzen:
- **Sol:** Symbol Info, Candle Chart (advanced), Baseline Chart
- **Sağ:** WatchlistButton, Technical Analysis özeti, Company Profile, Financials

Tümü `TradingViewWidget` iframe gömüleri ile render edilir.

---

## Sayfa: İzleme Listesi (`(root)/watchlist/page.tsx`)

Server component. İki sütunlu düzen:
- **Sol:** `WatchlistTable` — şirket, sembol, fiyat, değişim, piyasa değeri, F/K, alarm linki, aksiyon
- **Sağ:** Aktif alarmlar listesi, Finnhub quote endpoint'inden alınan güncel fiyatlarla
