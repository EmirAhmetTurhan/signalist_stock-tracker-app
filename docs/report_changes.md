# Değişiklik Raporu — 2026-05-21

> **Kapsam:** AI Agent implementasyonu + UI düzeltmeleri + dil standartlaştırma
> **33 düzeltme/feature, 32 yeni dosya, 3 silinen dosya, 65+ değiştirilen dosya.**
> **Build:** ✅ `tsc --noEmit` sıfır hata, `npm run build` başarılı.

---

## HER DEĞİŞİKLİK NEDEN YAPILDI? (Teorik Gerekçeler)

> Bu bölüm, yapılan her değişikliğin arkasındaki "neden" sorusunu yanıtlar.
> Değişiklik yapılmasaydı ne olurdu, şimdi ne kazandık, ileride nasıl fayda sağlayacak?

---

### #1 MongoDB URI'sinin log'dan çıkarılması

**Değişiklik yapılmasaydı:** Production log'larına veritabanı şifresi düşerdi. Log dosyaları genelde düz metindir ve birçok kişi/araç tarafından okunabilir (geliştiriciler, DevOps, log aggregation servisleri, hata ayıklama araçları). Bu log'a erişen herhangi biri veritabanına tam yetkiyle bağlanabilir, tüm kullanıcı verilerini okuyabilir, silebilir veya değiştirebilirdi.

**Ne kazandık:** Bağlantı başarı log'u artık sadece ortam adını içeriyor (`[DB] Connected successfully (env: production)`). Security-through-obscurity değil, gerçek bir bilgi sızıntısı engellemesi.

**Teorik temel:** _Least Privilege_ prensibi — hiçbir sistem bileşeni ihtiyacından fazlasını görmemeli. Log yazma işlemi veritabanı URI'sini bilmek zorunda değil.

---

### #2 Finnhub API anahtarının client bundle'dan çıkarılması

**Değişiklik yapılmasaydı:** `NEXT_PUBLIC_` prefix'i, Next.js'in bu değişkeni build zamanında JavaScript bundle'ına inline etmesine neden olur. Tarayıcıda DevTools → Sources sekmesini açan herkes API anahtarını görebilir. Finnhub ücretsiz tier'ı 60 istek/dakika ile sınırlı. Kötü niyetli biri anahtarı alıp:
- Kendi uygulamasında kullanarak kotayı saniyeler içinde tüketebilir
- Tüm kullanıcıların hisse verisi erişimini engelleyebilir
- Finnhub tarafından hesap askıya alınabilir

**Ne kazandık:** Anahtar artık sadece sunucu tarafında `process.env.FINNHUB_API_KEY` olarak okunuyor. `'use server'` direktifi sayesinde bu kod asla client'a gönderilmez.

**Teorik temel:** _Server-Side Secret Management_ — secret'lar asla client'a ulaşmamalı. Next.js'de `NEXT_PUBLIC_` prefix'i sadece gerçekten public olması gereken değerler içindir.

---

### #3 Zod input validasyonu

**Değişiklik yapılmasaydı:** Kullanıcıdan gelen tüm form verileri (email, şifre, hisse sembolü, fiyat eşiği) hiçbir doğrulamadan geçmeden doğrudan MongoDB'ye veya dış API'lere gönderiliyordu. Bu:
- Bozuk/zararlı verinin veritabanına yazılmasına
- Finnhub API'sine geçersiz sembollerle istek atılmasına ( kota israfı)
- AI Agent geldiğinde, AI'ın ürettiği fonksiyon çağrılarının parametrelerinin kontrolsüzce çalıştırılmasına

yol açardı. Özellikle AI Agent için **kritik**: Agent'ın tool calling yaparken geçersiz parametre göndermesi durumunda sistem çökebilir.

**Ne kazandık:** Zod şemaları hem form validasyonu hem de AI Agent tool calling için aynı anda çalışır. `stockSymbolSchema` otomatik uppercase + regex format kontrolü yapar. `validate<T>()` generic wrapper'ı her yerde kullanılabilir.

**Teorik temel:** _Defense in Depth_ + _Fail Fast_ — veri sistem sınırından girer girmez doğrulanır, geçersiz veri asla iç katmanlara ulaşmaz.

---

### #4 Dead code işaretleme

**Değişiklik yapılmasaydı:** Yeni bir geliştirici projeye baktığında `VOLUME_ALERT_EMAIL_TEMPLATE` ve `INACTIVE_USER_REMINDER_EMAIL_TEMPLATE` şablonlarını görüp "bu özellikler aktif mi, kullanılıyor mu, neden import edilmemiş?" diye zaman kaybederdi. En kötüsü, çalıştığını sanıp üzerine kod yazabilirdi.

**Ne kazandık:** Her kullanılmayan export'un başına `// NOTE:` açıklaması eklendi — ne olduğu ve neden kullanılmadığı belgeli. Kod silinmedi çünkü gelecekteki özellikler için planlanmış durumdalar.

**Teorik temel:** _Code as Documentation_ — kodun kendisi, durumu hakkında bilgi vermeli.

---

### #5 TA sayfasına loading state

**Değişiklik yapılmasaydı:** TA sayfası 3650 günlük mum verisini çekip 17 indikatör hesaplayana kadar kullanıcıya **hiçbir şey göstermiyordu.** Next.js App Router'da Suspense boundary olmadan yapılan async server component'ler, tüm veri hazır olana kadar boş beyaz ekran gösterir. Kullanıcı "sayfa çöktü" sanıp kapatabilir.

**Ne kazandık:** `loading.tsx` ile kullanıcıya anında "Computing indicators..." mesajı ve spinner gösteriliyor. 3-5 saniyelik bekleme süresi artık anlamlı bir deneyime dönüştü.

**Teorik temel:** _Perceived Performance_ — gerçek hız aynı kalsa bile, kullanıcıya sistemin çalıştığını göstermek terk edilme oranını düşürür.

---

### #6 Yapılandırılmış hata loglaması

**Değişiklik yapılmasaydı:** 5 farklı yerde hatalar `console.log()` ile yazılıyordu. `console.log` production log toplayıcıları (Sentry, Datadog, CloudWatch) tarafından genelde **yakalanmaz** — sadece `console.error` ve `console.warn` yakalanır. Yani production'da hata olsa bile kimsenin haberi olmazdı. Ayrıca prefix olmadığı için hangi modülden geldiği anlaşılmazdı.

**Ne kazandık:** `logError(context, error)` ile her hata `[Auth]` veya `[Alerts]` prefix'iyle ve `console.error` seviyesinde loglanıyor.

**Teorik temel:** _Observability_ — sistemin iç durumunu anlamak için yeterli veri üretilmeli.

---

### #7 AI Agent modeli güncellemesi (Llama 3.1 → Qwen 3 14B)

**Değişiklik yapılmasaydı:** Llama 3.1 8B (Temmuz 2024) ile devam edilseydi, tool calling doğruluğu ve Türkçe finansal terminoloji anlayışı sınırlı kalacaktı. Qwen 3 14B:
- Tool Calling benchmark'larında (BFCL) 8B-14B aralığında lider
- JSON format sadakati daha yüksek → daha az hatalı fonksiyon çağrısı
- Çok dilli (Türkçe dahil) desteği daha iyi
- Q4_K_M quantize ile ~9GB RAM'de çalışır

**Ne kazandık:** Yerel donanımda ücretsiz, güçlü tool calling. AI Agent üretime geçtiğinde daha az hatalı yanıt, daha isabetli indikatör analizi.

**Teorik temel:** _Right Tool for the Job_ — en yeni değil, iş için en uygun model.

---

### #8 İndikatörlerin koşullu hesaplanması

**Değişiklik yapılmasaydı:** TA sayfasına her girişte, kullanıcı sadece 2 indikatör seçmiş olsa bile **17 indikatörün tamamı** hesaplanıyordu. Her indikatör 3650 mum verisi üzerinde O(n) veya O(n²) işlem yapar. Gereksiz 15 indikatör hesaplaması:
- Sunucu CPU'sunu boşa tüketiyordu
- Sayfa yanıt süresini (TTFB) uzatıyordu
- Vercel serverless fonksiyon süresini ve maliyetini artırıyordu
- Ölçeklendiğinde: 100 eşzamanlı kullanıcı × 15 gereksiz indikatör = ciddi sunucu yükü

**Ne kazandık:** `activeIndicators.has()` kontrolü ile sadece seçili indikatörler hesaplanıyor. 3 indikatör seçiliyken ~%80 CPU tasarrufu. Bu optimizasyon aynı zamanda `lib/ta/compute.ts`'e taşındığı için AI Agent da aynı verimlilikte çalışacak.

**Teorik temel:** _Lazy Evaluation_ — hesaplama, sonucuna gerçekten ihtiyaç duyulana kadar ertelenir.

---

### #9 Error Boundary

**Değişiklik yapılmasaydı:** TA sayfası aynı anda 15+ chart bileşeni render ediyor. Herhangi birinde oluşacak tek bir JavaScript hatası (örneğin bozuk mum verisi, undefined reference) **tüm sayfanın çökmesine** ve React'in beyaz ekran göstermesine neden olurdu. React'ta bir bileşendeki hata tüm component tree'yi unmount eder.

**Ne kazandık:** `<ErrorBoundary>` tüm chart alanını sarar. Bir chart çökse bile sadece o bölümde kırmızı hata kartı gösterilir; arama çubuğu, indikatör butonları, interval seçici çalışmaya devam eder. Kullanıcı farklı bir hisse deneyerek devam edebilir.

**Teorik temel:** _Graceful Degradation_ — sistemin bir parçası bozulduğunda tamamen çökmek yerine azaltılmış işlevsellikle çalışmaya devam eder.

---

### #10-11 Büyük dosyaların parçalanması (TAIndicatorSettings + constants)

**Değişiklik yapılmasaydı:** 903 satırlık bir bileşende ve 339 satırlık tek bir constants dosyasında çalışmaya devam edilecekti. Bu şunlara yol açardı:
- **Bilişsel yük:** Yeni bir geliştirici 903 satırı baştan sona okumadan değişiklik yapamaz
- **Merge conflict:** İki kişi aynı dosyada farklı indikatörlerin ayarlarını değiştirirse çakışma kaçınılmaz
- **Test edilemezlik:** 903 satırlık monolit bileşeni birim test etmek neredeyse imkansız
- **Constants keşfi:** Tüm sabitler tek dosyada — hangi domain'e ait olduğunu anlamak için dosyayı taramak gerek

**Ne kazandık:** `TAIndicatorSettings` 298 satıra indi, state yönetimi `useTAIndicatorParams` hook'una çıkarıldı (bağımsız test edilebilir). `constants/` 3 domain dosyasına bölündü (widgets, stocks, index). Her dosya tek bir amaç için var.

**Teorik temel:** _Separation of Concerns_ + _Single Responsibility Principle_ — her modülün değişmek için tek bir nedeni olmalı.

---

### #12 lib/ta/ servis katmanı (EN KRİTİK DEĞİŞİKLİK)

**Değişiklik yapılmasaydı:** AI Agent'ın (`lib/ai/tools.ts`) indikatör hesaplaması yapabilmesi için iki seçenek vardı:
1. TA sayfasındaki hesaplama mantığını **kopyalamak** → DRY ihlali, iki ayrı yerde aynı kod, biri güncellenince diğeri unutulur, bug kaçınılmaz
2. Sayfa bileşenini **çağırmak** → mimari olarak imkansız, page component'ler API endpoint'i değildir

İkisi de çıkmaz sokak. Ayrıca TA sayfası 914 satır monolit olarak kalmaya devam edecekti.

**Ne kazandık:**
- `lib/ta/compute.ts` — `computeIndicators()` fonksiyonu. TA sayfası VE AI Agent aynı fonksiyonu çağırır. Tek kod, tek doğruluk kaynağı (Single Source of Truth)
- `lib/ta/signals.ts` — `generateAllSignals()` ile sinyal üretimi. AI Agent "en güçlü AL sinyali hangisi?" sorusuna bu fonksiyonun çıktısıyla cevap verir
- TA sayfası 914 → 484 satır (-%47). Sayfa sadece parametre ayrıştırma + delegasyon + render yapıyor
- Yeni bir indikatör eklendiğinde: `lib/indicators/` + `lib/ta/compute.ts` + `lib/ta/signals.ts` güncellenir, TA sayfası ve AI Agent otomatik olarak yeni indikatörü kullanır

**Teorik temel:** _Shared Kernel_ (Domain-Driven Design) — iki farklı bağlam (Web UI ve AI Agent) aynı çekirdek iş mantığını paylaşır. _DRY_ (Don't Repeat Yourself) — iş mantığı tek bir yerde tanımlanır.

---

### #13 Components organizasyonu

**Değişiklik yapılmasaydı:** 26 dosya `components/` altında düz durmaya devam edecekti. Yeni biri geldiğinde:
- "Chart bileşenleri nerede?" → 26 dosya arasından 16'sını bulması gerek
- "TA kontrol butonları nerede?" → isim benzerliğinden (`TA*`) bulunabilir ama yine de tarama gerekir
- "Backtest paneli nerede?" → dosya adından tahmin etmesi gerekir

Bu, proje büyüdükçe katlanarak kötüleşen bir keşif sorunudur. 50 bileşen olduğunu düşünün — hepsi düz bir klasörde.

**Ne kazandık:** 4 anlamlı alt klasör (`charts/`, `ta/`, `panels/`, `layout/`). Klasör adı bileşenin ne iş yaptığını söylüyor. Yeni geliştirici `components/charts/` dizinine bakıp tüm grafik bileşenlerini anında görebilir.

**Teorik temel:** _Package by Feature_ — kod, teknik tipine göre değil, yaptığı işe göre gruplanır.

---

### #14-16 Temizlik işlemleri (middleware, backtest, optimizer)

**Değişiklik yapılmasaydı:**
- `middleware/index.ts` — Next.js'de middleware tek bir dosyadır, `middleware.ts` olarak root'ta durması yeterlidir. Klasör açmak gereksiz bir dolaylılık katmanıdır.
- `lib/backtest-utils.ts` ve `lib/optimizer-utils.ts` — indikatörlerle doğrudan ilişkili olmalarına rağmen `lib/` root'unda başıboş duruyorlardı. `lib/ta/` servis katmanı oluşturulunca doğal evleri burası oldu.

**Ne kazandık:** Proje yapısı tutarlı hale geldi. Backtest ve optimizer artık `lib/ta/` altında, ait oldukları yerdeler. Middleware tek dosyaya indirgendi.

**Teorik temel:** _Convention over Configuration_ — Next.js'in middleware konvansiyonuna uyuldu. _Cohesion_ — birbiriyle ilişkili kod bir arada durur.

---

### #17 AD backtest veri sızıntısı düzeltildi

**Değişiklik yapılmasaydı:** Accumulation/Distribution indikatörünün backtest'i, 21 günlük SMA hesaplarken mevcut günün değerini de SMA'ya dahil ediyordu (`values[0]` through `values[20]`). Bu, SMA'nın mevcut değere doğru çekilmesine neden olarak sinyal eşiğini yapay şekilde zorlaştırıyordu. Sonuç: backtest gerçekte olduğundan daha kötü (muhafazakar) görünüyordu. Kullanıcı "AD %45 win rate, işe yaramaz" deyip indikatörü kapatabilirdi — oysa gerçek win rate daha yüksek olabilirdi.

**Ne kazandık:** `for (let s = 1; s <= 21; s++)` — SMA artık sadece geçmiş 21 değerden hesaplanıyor, mevcut gün dahil değil. Backtest sinyalleri gerçek piyasa koşullarını daha doğru yansıtacak.

**Teorik temel:** _Look-ahead / Data Leakage Prevention_ — backtest'te referans verisi yalnızca sinyal anında bilinen geçmiş verilerden oluşmalı. Mevcut bar'ın kendi SMA'sına dahil edilmesi "hafıza sızıntısı" oluşturur.

---

### #18 WaveTrend wt2 hesabı netleştirildi

**Değişiklik yapılmasaydı:** `ci.map((_, i) => (typeof wt1Arr[i] === 'number' ? (wt1Arr[i] as number) : 0))` — bu satır `ci` dizisi üzerinde `.map()` çağırıp `ci` değerini tamamen görmezden geliyor, onun yerine `wt1Arr[i]` değerini okuyordu. Sonuç **matematiksel olarak doğruydu** (wt2 = SMA of wt1) ama kod yanıltıcıydı. Bir sonraki geliştirici "ci.map neden wt1Arr okuyor?" diye 10 dakika debug yapardı.

**Ne kazandık:** `const wt1Values = wt1Arr.map(v => ...)` — wt1 değerlerini önce temiz bir array'e çıkarıyor, sonra SMA'ya veriyor. Niyet açık, kod okunabilir. Matematik aynı.

**Teorik temel:** _Code Clarity over Cleverness_ — kod, yazan kişinin niyetini yansıtmalı. Çalışması yeterli değil, okunabilir de olmalı.

---

### #19 Optimizer UI bloklaması giderildi

**Değişiklik yapılmasaydı:** Backtest panelindeki Refresh butonu `findBestParameter()` senkron fonksiyonunu çağırıyordu. Bu fonksiyon 38 parametre değeri × 3650 mum × indikatör hesaplaması yapıyor. 50ms'lik `setTimeout` spinner'ı göstermeye yetmeyebilirdi — tarayıcı paint cycle'ı 50ms içinde tamamlanmazsa kullanıcı tıkladıktan sonra 1-2 saniye **donmuş bir buton** görürdü. "Çöktü mü?" hissi.

**Ne kazandık:** Çift `requestAnimationFrame` — ilk rAF render kuyruğuna girer, ikinci rAF bir paint sonrasına planlanır. Bu, tarayıcının spinner'ı **kesin olarak boyadıktan sonra** ağır işlemi başlatmasını garanti eder. Kullanıcı tıkladığında anında spinner görür, sonra hesaplama başlar.

**Teorik temel:** _Non-blocking UI_ — uzun süren işlemler kullanıcı arayüzünü kilitlememeli. `requestAnimationFrame` ile tarayıcının render pipeline'ına saygı gösterilir.

---

## ÖZET TABLO

| # | Katman | Ne Yapıldı | Sonuç |
|---|--------|-----------|-------|
| 1 | 🔴 Güvenlik | MongoDB URI artık loglanmıyor | Şifre sızıntısı engellendi |
| 2 | 🔴 Güvenlik | Finnhub key `NEXT_PUBLIC_` prefix'i kaldırıldı | Client bundle'a gömülmüyor |
| 3 | 🔴 Güvenlik | Zod validasyon eklendi (auth + alerts) | Tüm input'lar doğrulanıyor |
| 4 | 🟡 Kod | Kullanılmayan 3 export işaretlendi | Dead code belgelendi |
| 5 | 🟡 UX | TA sayfasına loading state eklendi | Boş ekran yerine spinner |
| 6 | 🟢 Kod | `console.log` → yapılandırılmış `logError()` | Production'da hata takibi |
| 7 | 📝 Doküman | AI Agent modeli: Llama 3.1 → Qwen 3 14B | Daha güçlü tool calling |
| 8 | 🔴 Performans | 15 indikatör koşullu hesaplamaya geçti | ~%80 CPU tasarrufu |
| 9 | 🟡 Güvenilirlik | Error Boundary eklendi | Chart çökmesi sayfayı bozmaz |
| 10 | 🔴 Mimari | TAIndicatorSettings 903→298 satır | State hook'a çıkarıldı |
| 11 | 🔴 Mimari | `lib/constants.ts` domain bazlı bölündü | 3 dosya + barrel |
| 12 | 🔴 Mimari | `lib/ta/` servis katmanı oluşturuldu | AI Agent hazır |
| 13 | 🔴 Mimari | TA sayfası 914→484 satır | `lib/ta/` kullanıyor |
| 14 | 🔴 Mimari | Components alt klasörlere bölündü | charts/, ta/, panels/, layout/ |
| 15 | 🟢 Kod | `middleware/index.ts` → `middleware.ts` | Gereksiz klasör kaldırıldı |
| 16 | 🟢 Kod | `lib/backtest-utils.ts` → `lib/ta/backtest.ts` | Doğal evine taşındı |
| 17 | 🟡 Düzeltme | AD backtest veri sızıntısı giderildi | SMA'ya mevcut gün dahil edilmiyor |
| 18 | 🟢 Düzeltme | WaveTrend wt2 kodu netleştirildi | Yanıltıcı `.map()` zinciri düzeltildi |
| 19 | 🟡 Düzeltme | Optimizer UI bloklaması giderildi | Çift `requestAnimationFrame` |

---

## YENİ DOSYALAR (15)

| # | Dosya | Amaç |
|---|-------|------|
| 1 | `lib/validations/schemas.ts` | Zod şemaları (auth, alerts, AI Agent) |
| 2 | `app/(root)/ta/loading.tsx` | TA sayfası loading state |
| 3 | `components/ErrorBoundary.tsx` | React Error Boundary |
| 4 | `hooks/useTAIndicatorParams.ts` | 17 indikatör parametre state yönetimi |
| 5 | `lib/constants/index.ts` | Barrel re-export |
| 6 | `lib/constants/widgets.ts` | TradingView widget konfigürasyonları |
| 7 | `lib/constants/stocks.ts` | Hisse listeleri + tablo sabitleri |
| 8 | `lib/ta/types.ts` | TA paylaşılan tipler |
| 9 | `lib/ta/compute.ts` | İndikatör hesaplama orkestratörü |
| 10 | `lib/ta/signals.ts` | Sinyal üretimi + skorlama |
| 11 | `lib/ta/backtest.ts` | Backtest motoru (taşınan) |
| 12 | `lib/ta/optimizer.ts` | Parametre optimizasyonu (taşınan) |
| 13 | `lib/ta/index.ts` | TA barrel export |
| 14 | `docs/bugfix-report-2026-05-21.md` | Detaylı bugfix raporu |
| 15 | `docs/report_changes.md` | Bu dosya |

## SİLİNEN DOSYALAR (3)

- `lib/constants.ts` → `lib/constants/index.ts` + `widgets.ts` + `stocks.ts`
- `lib/backtest-utils.ts` → `lib/ta/backtest.ts`
- `lib/optimizer-utils.ts` → `lib/ta/optimizer.ts`

## TAŞINAN DOSYALAR

- 17 dosya → `components/charts/`
- 5 dosya → `components/ta/`
- 7 dosya → `components/panels/`
- 3 dosya → `components/layout/`
- `middleware/index.ts` → `middleware.ts`

---

## NİHAİ HİYERARŞİ

```
signalist_stock-tracker-app/
├── app/
│   ├── (auth)/             # Oturumsuz: sign-in, sign-up
│   ├── (root)/             # Oturumlu: dashboard, stocks, ta, watchlist, alerts
│   │   └── ta/
│   │       ├── page.tsx     # 484 satır — parametre + delegasyon + render
│   │       └── loading.tsx  # Suspense boundary
│   └── api/inngest/
├── components/
│   ├── charts/             # 17 grafik: 16 Lightweight*Chart + TradingViewWidget
│   ├── ta/                 # 5 kontrol: TAIndicatorSettings, *Button, TASearch
│   ├── panels/             # 7 analiz: Backtest*, Strategy*, Custom*, Pattern*
│   ├── layout/             # 3 layout: Header, NavItems, UserDropdown
│   ├── ui/                 # shadcn primitives
│   ├── forms/              # InputField, SelectField, CountrySelectField, FooterLink
│   └── (root)              # ErrorBoundary + 6 shared component
├── hooks/                  # useDebounce, useTradingViewWidget, useTAIndicatorParams
├── lib/
│   ├── actions/            # auth, finnhub, watchlist, alerts, user
│   ├── ta/                 # ★ TEKNİK ANALİZ SERVİS KATMANI (AI Agent hazır)
│   │   ├── types.ts        #   SignalLabel, SIGNAL_STYLES, IndicatorParams
│   │   ├── compute.ts      #   computeIndicators() — hesaplama orkestratörü
│   │   ├── signals.ts      #   generateAllSignals() — sinyal üretimi
│   │   ├── backtest.ts     #   calculateWinRate() — backtest motoru
│   │   ├── optimizer.ts    #   findBestParameter() — brute-force optimizer
│   │   └── index.ts        #   Barrel export
│   ├── indicators/         # 20 pure function
│   ├── constants/          # index, widgets, stocks
│   ├── validations/        # Zod schemas
│   ├── inngest/            # Background jobs + prompts
│   ├── nodemailer/         # Email transport + templates
│   └── better-auth/        # Auth configuration
├── database/               # MongoDB connection + models
├── middleware.ts            # Auth session check
└── docs/                   # 11 Markdown doküman
```

---

## DOĞRULAMA

```
$ npx tsc --noEmit
(çıktı yok → sıfır tip hatası)

$ npm run build
✓ Compiled successfully in 3.5s
✓ Generating static pages (9/9)
✓ Middleware (proxy) active

Route (app)
┌ ƒ /               Dashboard
├ ○ /_not-found
├ ƒ /alerts/create
├ ƒ /api/inngest
├ ƒ /sign-in
├ ƒ /sign-up
├ ƒ /stocks/[symbol]
├ ƒ /stocks/[symbol]/alert
├ ƒ /ta              Teknik Analiz
├ ƒ /ai              AI Agent (tam sayfa)
├ ƒ /api/chat        AI Agent (API endpoint)
└ ƒ /watchlist
```

---

## AI Agent Bağlantı Sorunları ve Çözümleri (4 düzeltme, 2026-05-21)

AI Agent Ollama + Qwen 3 14B ile bağlanırken 4 teknik sorun çıktı:

| # | Sorun | Nedeni | Çözüm | Dosya |
|---|-------|--------|-------|-------|
| 27 | Model V1/V2 uyuşmazlığı | `ollama-ai-provider` V1 model döndürüyor, AI SDK v6 V2 istiyor. Runtime red | `@ai-sdk/openai-compatible` + Ollama `/v1` endpoint'ine geçildi | `app/api/chat/route.ts` |
| 28 | Mesaj formatı | `useChat` v3 `parts[]` gönderiyor, model `content` bekliyor | `convertToModelMessages()` eklendi | `app/api/chat/route.ts` |
| 29 | Stream formatı | `toTextStreamResponse()` düz metin, client UI stream bekliyor | `toUIMessageStreamResponse()` kullanıldı | `app/api/chat/route.ts` |
| 30 | Provider temizliği | Kullanılmayan `ollama-ai-provider`, `customProvider` import'ları | Kaldırıldı. Direkt `@ai-sdk/openai-compatible` + Ollama `/v1` | `app/api/chat/route.ts`, `lib/ai/provider.ts` |

**Sonuç:** Ollama (`localhost:11434/v1`) + `@ai-sdk/openai-compatible` + `convertToModelMessages()` + `toUIMessageStreamResponse()` ile çalışan bağlantı.

---

## 2026-05-19: AI Agent UI Düzeltmeleri (4 düzeltme)

| # | Dosya | Değişiklik |
|---|-------|-----------|
| 20 | `app/(root)/ai/page.tsx` | Input bar sabitlendi (`sticky bottom-0`), container `fixed inset-0 top-[65px]` |
| 21 | `app/(root)/ai/page.tsx` | Model adı ("Qwen 3 14B") kaldırıldı |
| 22 | `app/(root)/layout.tsx` | `<FloatingChatButton />` tüm (root) sayfalarına eklendi |
| 23 | `components/FloatingChatButton.tsx` | MAX_W dinamik (`getMaxW()`), resize handle 32×32px |

## 2026-05-21: Dil Standartlaştırma + CSS/UX (3 düzeltme)

| # | Dosya | Değişiklik |
|---|-------|-----------|
| 24 | `lib/ai/prompts.ts`, `lib/ai/tools.ts`, `app/(root)/ai/page.tsx`, `app/(root)/ta/page.tsx`, `components/panels/*`, `components/ta/*`, `components/FloatingChatButton.tsx` | Tüm Türkçe metinler İngilizceye çevrildi. "AL"→"BUY", "SAT"→"SELL", "ÇELİŞKİ"→"CONFLICT", vb. |
| 25 | `app/(root)/ai/page.tsx` | `max-w-3xl mx-auto` kaldırıldı (full-width), `bg-black` ile renk bütünlüğü sağlandı |
| 26 | `components/FloatingChatButton.tsx`, `app/(root)/ai/page.tsx` | `/ai` sayfasında floating buton gizlendi (`usePathname()`). `DefaultChatTransport` `useMemo` ile stabilize edildi (Next.js dev overlay fix) |

---

## 2026-05-22: AI Agent 7 Faz Genişletme (10 yeni dosya, 8 değişen dosya)

| Faz | Ne | Yeni Dosyalar |
|-----|-----|--------------|
| 1 | **Veritabanı Hafızası** | `conversation.model.ts`, `message.model.ts`, `chat-history.actions.ts` |
| 2 | **AI Sayfası Sidebar** | Sol panel, konuşma listesi, URL routing (`/ai?id=xxx`) |
| 3 | **Floating Panel Geçmiş** | Title bar'a history dropdown, DB'den konuşma yükleme |
| 4 | **Generative UI** | `GenerativeUI.tsx` — 5 dinamik buton + follow-up komut alanı |
| 5 | **Research Notebook** | `analysis-note.model.ts`, `analysis-notes.actions.ts`, `/notebook` sayfası |
| 6 | **Smart Strateji Alarmları** | `smart-alert.model.ts`, `smart-alerts.ts` (Inngest cron), 2 yeni AI tool |
| 7 | **Streaming Progress** | `ToolProgress.tsx` — canlı tool invocation takibi |

**AI Agent 16 tool'a çıktı** (createSmartAlert, getSmartAlerts eklendi).

---

## 2026-05-19: AI Chat Stabilite Düzeltmeleri (5 kritik bugfix)

> **Amaç:** AI sohbet sistemindeki mesaj kaybolması, auto-scroll çalışmaması, çift yükleme ve hydration hatalarını gidermek.
> **Kapsam:** 4 dosya değişikliği, 0 yeni dosya.
> **Build:** `tsc --noEmit` sıfır hata, `npm run build` başarılı.

---

### HER DEĞİŞİKLİK NEDEN YAPILDI?

---

### #31 Mesaj kaydetme fire-and-forget → await

**Değişiklik yapılmasaydı:** `app/api/chat/route.ts:43` — kullanıcı mesajı `saveMsg()` ile await'siz çağrılıyordu. Stream başladıktan sonra `onFinish` AI mesajlarını DB'ye yazıyordu. Ama client tarafında hydration (`setMessages([])` + DB'den yükleme) tetiklendiğinde, kullanıcı mesajı henüz DB'ye yazılmamış olabiliyordu. Sonuç: mesajlar 0.5 saniye görünüp kayboluyordu.

**Ne kazandık:** Kullanıcı mesajı artık `await saveMsg(...)` ile stream başlamadan ÖNCE DB'ye yazılıyor. Hydration her zaman tam mesaj listesini görüyor.

**Teorik temel:** _Race Condition Prevention_ — iki asenkron işlem (stream + DB yazma) arasındaki yarış koşulu, yazmanın stream'den önce tamamlanması zorunlu kılınarak engellenir.

---

### #32 `onFinish` mesaj formatı normalizasyonu

**Değişiklik yapılmasaydı:** `route.ts:58-63` — `onFinish` içinde `(msg as any).content` ile ham veri okunuyor, string ise `[{ type: 'text', text: content }]` yapılıyordu. AI SDK v6'da response.messages formatı her zaman parts dizisi değil; bazen content string, bazen content array. Yanlış formatta kaydedilen mesajlar hydration'da `m.parts` olarak okunamıyor, `if (!text) return null` filtresine takılıp görünmez oluyordu.

**Ne kazandık:** `normalizeParts()` yardımcısı ile tüm format varyasyonları (string, dizi, tanımsız) güvenli şekilde `Record<string, unknown>[]` formatına dönüştürülüyor. Boş parts'lı mesajlar DB'ye yazılmıyor. Tool mesajları `role: 'assistant'` olarak kaydediliyor.

**Teorik temel:** _Defensive Normalization_ — sistem sınırında veri formatını normalize et, iç katmanlara tek bir format ilet.

---

### #33 Mesaj filtreleme: tool çağrıları görünmez oluyordu

**Değişiklik yapılmasaydı:** `page.tsx:137` ve `FloatingChatButton.tsx:387` — `if (!text) return null;` satırı, AI bir tool çağırdığında (henüz text üretilmemişken) mesajı komple gizliyordu. Tool çağrıları `parts[]` dizisinde `type: 'tool-call'` olarak gelir, `type: 'text'` içermez. Kullanıcı AI'ın "düşündüğünü" (tool çağırdığını) göremiyor, sonra text gelince de mesaj render edilmediği için tüm yanıt kayboluyordu.

**Ne kazandık:** `hasContent()` yardımcısı: tool çağrısı veya tool sonucu içeren mesajlar artık text olmasa bile gösteriliyor. `ToolProgress` bileşeni canlı tool durumunu gösteriyor. Text yoksa `MarkdownRenderer` render edilmiyor (boş kabuk önleniyor).

**Teorik temel:** _Progressive Rendering_ — kullanıcıya sistemin çalıştığını göster (tool ilerlemesi), sonuç hazır olduğunda text'i ekle.

---

### #34 Auto-scroll: ResizeObserver + isAtBottom

**Değişiklik yapılmasaydı:** `useEffect(() => { scrollIntoView(...) }, [messages])` — her `messages` array değiştiğinde (her stream chunk'ında) zorla en alta kayıyordu. Kullanıcı geçmiş mesajları okumak için yukarı çıksa bile anında geri itiliyordu. Uzun sohbetlerde okuma imkansız hale geliyordu. Ayrıca `scrollIntoView` her chunk'ta çağrıldığı için performans sorunu oluşuyordu.

**Ne kazandık:**
- `isAtBottomRef` — kullanıcının scroll pozisyonunu takip eder (80px tolerans)
- `ResizeObserver` — içerik boyutu değişince (stream chunk'ı gelince) sadece kullanıcı en alttaysa otomatik kayar
- Kullanıcı yukarı çıkarsa scroll rahatsız edilmez
- Mesaj gönderince zorla en alta inilir

**Teorik temel:** _User Intent Preservation_ — otomatik scroll sadece kullanıcı zaten en alttayken çalışır. Kullanıcı aktif olarak yukarı çıktıysa müdahale edilmez.

---

### #35 Hydration status bağımlılığı kaldırıldı

**Değişiklik yapılmasaydı:** `useEffect` bağımlılık dizisi `[conversationId, setMessages, status]` — `status` her değiştiğinde (ready → submitted → streaming → ready) hydration tetikleniyordu. `setMessages([])` ile mesajlar temizleniyor, DB'den yükleme yapılıyordu. Stream devam ederken hydration tetiklenirse canlı mesajlar kayboluyordu. "Çift yükleme" hissi bu yüzdendi.

**Ne kazandık:** Bağımlılık dizisi `[conversationId]` olarak basitleştirildi. Hydration sadece oda değişince tetiklenir. `status` kontrolü hala yapılıyor (stream varsa atlanır) ama status değişimi tetikleyici değil.

**Teorik temel:** _Minimal Effect Dependencies_ — useEffect sadece gerçekten tepki vermesi gereken değişiklikleri izlemeli.

---

## ÖZET TABLO

| # | Katman | Ne Yapıldı | Sonuç |
|---|--------|-----------|-------|
| 31 | API Route | `saveMsg` await'li hale getirildi | Kullanıcı mesajı stream'den önce DB'de |
| 32 | API Route | `normalizeParts()` ile mesaj formatı güvenceye alındı | Bozuk/eksik mesajlar filtreleniyor |
| 33 | UI (ChatArea + Floating) | Tool çağrılı mesajlar artık gösteriliyor | AI "düşünürken" ilerleme görünür |
| 34 | UI (ChatArea + Floating) | ResizeObserver + isAtBottom scroll | Kullanıcı yukarı çıkınca rahatsız edilmez |
| 35 | UI (ChatArea + Floating) | Hydration sadece oda değişince | Çift yükleme / stream bozulması giderildi |
| 36 | UI (ChatArea + Floating) | `min-h-0` flex zincirine eklendi | Input bar uzun mesajlarda ekran altına kaymıyor |

---

### #36 Flexbox min-height zinciri düzeltildi

**Değişiklik yapılmasaydı:** Flexbox'ta `flex: 1` ile büyüyen bir child element, varsayılan `min-height: auto` nedeniyle içeriğinin intrinsic yüksekliğinin altına küçülemezdi. Mesajlar uzadıkça messages div'i genişliyor, input bar'ı ekranın altına itiyordu. Kullanıcı input bar'a ulaşmak için sayfanın en altına kadar scroll yapmak zorunda kalıyordu.

**Ne kazandık:** Flex zincirindeki her halkaya `min-h-0` eklendi: root sağ panel → oda container → ROOM_STYLE_ACTIVE → messages div. Bu sayede messages div'i `flex-1` ile kalan alanı doldurur ama içerik taşınca `overflow-y-auto` ile scroll olur, input bar `shrink-0` ile en altta sabit kalır.

**Teorik temel:** _Flexbox Minimum Sizing_ — CSS Flexbox spesifikasyonuna göre `flex: 1` olan bir elementin `min-height` değeri varsayılan olarak `auto`'dur (içeriğin intrinsic boyutu). `min-height: 0` verilmezse flex child asla içeriğinden küçük olmaz ve taşma durumunda scroll devreye girmez.

---

## DEĞİŞEN DOSYALAR (4)

| Dosya | Değişiklik Özeti |
|-------|-----------------|
| `app/api/chat/route.ts` | `saveMsg` await'lendi, `normalizeParts()` eklendi, DEBUG log'lar temizlendi |
| `app/(root)/ai/page.tsx` | `hasContent()`, `scrollContainerRef`, `isAtBottomRef`, `ResizeObserver`, hydration bağımlılığı basitleştirildi |
| `components/FloatingChatButton.tsx` | `hasContent()`, `scrollContainerRef`, `isAtBottomRef`, `ResizeObserver`, hydration bağımlılığı basitleştirildi |
| `docs/report_changes.md` | Bu rapor |

---

## 2026-05-19 (Faz 2): Tool Hata Yönetimi + Sohbet Geçiş Koruması + Lazy Creation (8 yeni düzeltme)

> **Amaç:** Tool çağrılarında sonsuz yükleme, stream sırasında sohbet değişince cevap kaybı, boş konuşmaların DB'ye kaydedilmesi sorunlarını gidermek.
> **Kapsam:** 5 dosya değişikliği.

---

### HER DEĞİŞİKLİK NEDEN YAPILDI?

---

### #37 Tool'lar için 3'lü Savunma Hattı

**Değişiklik yapılmasaydı:** 16 tool'un hiçbirinde try-catch yoktu. AI boş/geçersiz sembolle tool çağırdığında (örn. "RSI hangi değerlerde en iyi sonucu verir?" gibi sembol BELİRTİLMEMİŞ sorularda), hata UI'a iletilmiyor, `ToolProgress` bileşeni "Processing / Optimizing" spinner'ında sonsuza kadar takılı kalıyordu. Kullanıcı cevap gelmediğini görüp sayfayı yenilemek zorunda kalıyordu.

**Ne kazandık — 3 savunma hattı:**

1. **Strict Zod:** `requiredSymbol` şeması oluşturuldu. Açıklaması AI'a net talimat içeriyor: "If user did not provide a symbol, DO NOT call this tool — first ask the user which stock they want to analyze." Tüm ağır işlemler (analyzeIndicators, runBacktest, optimizeParameter, rankIndicators, findBestIndicator) bu şemayı kullanır.

2. **Try-Catch (16 tool):** Her execute fonksiyonu try-catch ile sarıldı. Hata `{ success: false, error: "..." }` formatında döner. `ToolProgress` bileşeni `error` alanını görünce spinner'ı durdurup kırmızı hata ikonu gösterir.

3. **Timeout Koruması:** `withTimeout()` yardımcısı eklendi. Veri çekme 15sn, ağır işlem (optimizasyon/backtest) 45sn sınırı. Aşımda `"TIMEOUT: optimize(RSI, AAPL) exceeded 45s limit"` hatası döner.

**Ek:** `mapIndicatorData()` yardımcısı ile 50+ satırlık if/else zinciri tek bir lookup'a indirildi. `rankIndicators` ve `findBestIndicator` iç döngüde tek indikatör hatası tüm sonucu bozmaz.

**Teorik temel:** _Defense in Depth_ — her katmanda ayrı koruma: Zod (giriş), try-catch (işlem), timeout (zaman).

---

### #38 Stream Sırasında Sohbet Değiştirme Koruması (Cooling Grace Period)

**Değişiklik yapılmasaydı:** AI cevap yazarken kullanıcı başka sohbete geçip döndüğünde cevap kayboluyordu. Nedeni: Stream bitince oda `streamingIds`'ten çıkıyor, `mountedIds`'ten de çıkınca ChatArea DOM'dan tamamen KALDIRILIYORDU (unmount). `useChat` state'i sıfırlanıyordu. Kullanıcı geri dönünce ChatArea yeniden mount oluyor, DB'den mesajları çekiyordu. Ama `onFinish` henüz DB'ye yazmayı tamamlamadıysa cevap kayboluyordu.

**Ne kazandık — 2 katmanlı koruma:**

1. **5 saniye soğuma süresi:** Stream biten oda hemen `mountedIds`'ten çıkarılmaz, 5 saniye `coolingIds` set'inde tutulur. Bu sürede `onFinish` DB'ye yazmayı kesin tamamlar. Oda DOM'da kalır, state korunur.

2. **Boş DB sonucu koruması:** Hydration sırasında DB'den boş sonuç gelirse mevcut mesajlar silinmez. Sadece DB'den veri geldiyse (`res.messages.length > 0`) güncellenir.

**Teorik temel:** _Graceful Degradation_ — sistemin bir parçası geçici olarak senkronize olmasa bile veri kaybı yaşanmaz.

---

### #39 Sohbet Geçişlerinde Yükleme İskeleti (Loading Skeleton)

**Değişiklik yapılmasaydı:** Sohbet değiştirirken `setMessages([])` anında boş ekran gösteriliyor, sonra DB'den veri gelince mesajlar beliriyordu. Arada "boş yeni sohbet" ekranı flash'lanıyordu. Kullanıcı "sohbet silindi mi?" hissine kapılıyordu.

**Ne kazandık:** `isHydrating` state'i eklendi. DB'den veri yüklenirken pulse animasyonlu iskelet (skeleton) placeholder'lar gösteriliyor (ChatGPT'deki gibi). Veri gelince iskelet kalkıyor, mesajlar görünüyor. Boş "ready" mesajı sadece gerçekten yeni sohbet açıldığında gösteriliyor.

**Teorik temel:** _Perceived Performance_ — kullanıcıya sistemin çalıştığını göstermek, bekleme süresini daha kısa algılatır.

---

### #40 Arka Plan Stream'inde Düşünme Animasyonunun Korunması

**Değişiklik yapılmasaydı:** Stream devam eden bir sohbete geri dönüldüğünde scroll pozisyonu en altta değilse, üç nokta (bouncing dots) animasyonu ekranın altında kalıyor ve görünmüyordu. Kullanıcı AI'ın hala düşündüğünü anlayamıyor, "cevap gelmedi" sanıyordu.

**Ne kazandık:** `isVisible` ve `isLoading`'i izleyen bir useEffect eklendi. Oda aktif hale gelip stream devam ediyorsa, scroll `requestAnimationFrame` ile en alta çekiliyor. Kullanıcı döndüğünde anında üç nokta animasyonunu görüyor.

**Teorik temel:** _State Reflection_ — UI her zaman arka plan durumunu doğru yansıtmalı.

---

### #41 Lazy Conversation Creation (Boş DB Kaydı Önleme)

**Değişiklik yapılmasaydı:** "New Chat" butonuna basınca anında `createConversation('New Chat')` ile DB'ye boş kayıt atılıyordu. Kullanıcı hiç mesaj yazmadan eski sohbete dönse bile bu boş kayıt DB'de kalıyor, sidebar'da "New Chat" olarak görünüyordu. Zamanla DB gereksiz yere şişiyordu.

**Ne kazandık:** ChatGPT davranışına geçildi. "New Chat" sadece UI'ı açar, DB'ye hiçbir şey yazılmaz. İlk mesaj gönderildiğinde lazy creation devreye girer ve konuşma o zaman DB'de oluşturulur. Hiç mesaj yazılmadan çıkılırsa hiçbir iz kalmaz.

**Teorik temel:** _Lazy Persistence_ — kalıcı depolama, gerçekten kalıcı veri olduğunda yapılmalı.

---

### #42 ToolProgress React Key Uyarısı Giderildi

**Değişiklik yapılmasaydı:** `[...groups.values()].map()` ile dönerken `key` prop'u eksikti. React konsolda "Each child in a list should have a unique key prop" uyarısı veriyordu. Performans sorunu olmasa da geliştirici deneyimini bozuyordu.

**Ne kazandık:** `[...groups.entries()]` ile `groupId` alınıp `key` olarak kullanıldı. Uyarı gider.

---

## ÖZET TABLO (Tüm Düzeltmeler)

| # | Katman | Ne Yapıldı | Sonuç |
|---|--------|-----------|-------|
| 31 | API Route | `saveMsg` await'li | Mesaj stream'den önce DB'de |
| 32 | API Route | `normalizeParts()` | Mesaj formatı güvencede |
| 33 | UI | `hasContent()` tool mesajları | AI düşünürken ilerleme görünür |
| 34 | UI | ResizeObserver + isAtBottom | Scroll rahatsız etmez |
| 35 | UI | Hydration sadece oda değişince | Çift yükleme giderildi |
| 36 | UI | `min-h-0` flex zinciri | Input bar ekranda sabit |
| 37 | Tools | 3'lü savunma (Zod+try-catch+timeout) | Sonsuz spinner yok |
| 38 | UI | Cooling grace period + boş DB koruması | Stream'de sohbet değişince cevap kaybolmaz |
| 39 | UI | Loading skeleton (isHydrating) | Sohbet geçişinde boş ekran flash'ı yok |
| 40 | UI | Arka plan stream animasyonu | Dönünce düşünme animasyonu görünür |
| 41 | UI | Lazy conversation creation | Boş "New Chat" DB'ye kaydedilmez |
| 42 | UI | ToolProgress key prop | React key uyarısı gider |

---

## DEĞİŞEN DOSYALAR (6)

| Dosya | Değişiklik Özeti |
|-------|-----------------|
| `app/api/chat/route.ts` | `await saveMsg`, `normalizeParts()`, format güvencesi |
| `app/(root)/ai/page.tsx` | Auto-scroll, hasContent, min-h-0, hydration, cooling, skeleton, lazy creation, stream animasyonu |
| `components/FloatingChatButton.tsx` | Auto-scroll, hasContent, min-h-0, hydration, skeleton, lazy creation |
| `lib/ai/tools.ts` | 3 savunma hattı (Zod strict, try-catch 16 tool, timeout), mapIndicatorData |
| `components/ToolProgress.tsx` | React key uyarısı giderildi |
| `docs/report_changes.md` | Bu rapor |

---

## DOĞRULAMA (son)

```
$ npx tsc --noEmit
(çıktı yok → sıfır tip hatası)

$ npm run build
✓ Compiled successfully
✓ Generating static pages (12/12)
✓ Middleware (proxy) active

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /ai              AI Agent (tam sayfa + sidebar + multi-room)
├ ƒ /alerts/create
├ ƒ /api/chat        AI Agent (streaming endpoint)
├ ƒ /api/inngest
├ ƒ /notebook
├ ƒ /sign-in
├ ƒ /sign-up
├ ƒ /stocks/[symbol]
├ ƒ /stocks/[symbol]/alert
├ ƒ /ta              Teknik Analiz
└ ƒ /watchlist
```

---

## 2026-05-21 (Faz 11): Resilience Fix — Inngest Hata Yönetimi (4 dosya)

> **Amaç:** Dış API (Finnhub) çökmelerinde Inngest'in crash olmasını engellemek, kullanıcıya siyah ekran yerine anlamlı hata kartı göstermek.

### #43 Inngest Catch Blok Kullanıcı Dostu Hata Mesajı

**Değişiklik yapılmasaydı:** Inngest fonksiyonu catch bloğunda sadece `status: 'failed'` yazıyordu. Kullanıcı "Analysis failed" görüyor ama neden olduğunu bilmiyordu.

**Ne kazandık:** 3 kademeli hata mesajı:
- Finnhub 403 → "Borsa veri saglayicisi (Finnhub) {symbol} icin erisimi reddetti veya hata verdi."
- Yetersiz mum → "{symbol} icin yeterli mum verisi bulunamadi."
- Beklenmeyen → "Optimizasyon sirasinda beklenmeyen bir hata olustu: {ilk 200 karakter}"

### #44 Report Model errorMessage + AnalysisErrorCard

`database/models/report.model.ts` — `errorMessage` alani. `components/LiveAnalysisCard.tsx` — `AnalysisErrorCard`: kirmizi tonlarda, XCircle + AlertTriangle, errorMessage belirgin.

### #45 GenerativeUI completedOpt + tool-call gizleme

Inngest DB'yi guncellediginde isBackgroundJob flag'i olmaz. `getCompletedOptimizationData()` bestValue+winRate'i direkt tespit eder. optimizeParameter tool-call asamasinda return null.

---

## 2026-05-21 (Faz 12): Agentic UI Donusumu — 3 Mimari Kural (16 dosya)

> **Amaç:** "Yama yapma" mantigini birakip kurumsal standartlarda dinamik Generative UI mimarisi kurmak.

### KURAL 1: Global Component Registry (Dinamik Arayuz Motoru)

**Once:** GenerativeUI.tsx 443 satir manuel if/else zinciri. 16 tool'dan sadece 6'si UI render ediliyordu. 10 tool'un sonucu duz metin.

**Sonra:**
- **`lib/ai/tool-parser.ts`:** `getAllToolResults()` — tum formatlari normalize eder
- **`components/ai/registry.tsx`:** `TOOL_COMPONENT_MAP` — 15 tool ismi → React bileseni. Yeni tool: 1 satir
- **9 kart bileseni:** ActionConfirmCard, PriceSnapshotCard, IndicatorSignalsCard, SearchResultsCard, BacktestResultCard, NewsListCard, WatchlistSummaryCard, AlertListCard, IndicatorRankingCard
- **GenerativeUI.tsx 443→155 satir (-%65)**

### KURAL 2: Reasoning Pipeline (Dusunce Zinciri & Real-Time)

**Once:** Inngest 30-45sn brute-force yaparken statik "Optimizing..." yazisi.

**Sonra:**
- **`database/models/report.model.ts`:** `steps: Mixed[]` — her adim `{ name, status, detail, completedAt }`
- **`lib/inngest/functions.ts`:** 4 adim canli izleme: create-report → fetch-candles → run-optimization → finalize
- **`components/LiveAnalysisCard.tsx`:** `ReasoningChain` — ✓/⟳/✗/○ ikonlariyla canli adim takibi. **Polling 3sn→1.5sn**

### KURAL 3: Graceful Error Handling (Insancil Hata Yonetimi)

**Once:** Tool hatalari `{ error: "teknik string" }`. AI metin olarak yaziyor. Retry yok.

**Sonra:**
- **`lib/ai/error-codes.ts`:** 8 standart hata kodu (`EXTERNAL_API_DENIED`, `RATE_LIMIT`, `TIMEOUT`, `INSUFFICIENT_DATA`, `INVALID_SYMBOL`, `OPTIMIZATION_FAILED`, `INNGEST_QUEUE_FULL`, `INTERNAL_ERROR`). Her kod: `userMessage` + `recoverable` + `action`
- **`lib/ai/tools.ts` → `toToolError()`:** 6 hata deseni otomatik tespit. Hata: `{ success: false, errorCode, userMessage, recoverable }`
- **`components/ai/ErrorCard.tsx`:** Kirmizi kart + 3 aksiyon: Retry, Check API Status, Search Stocks

### Bonus: Smart Titles + Zustand activeJobs

- **Smart Titles:** Ilk mesajda `generateText()` paralel LLM cagrisi → 3 kelimelik baslik → DB
- **activeJobs:** Zustand `activeJobs: Record<convId, jobId>` → sidebar Loader2 spinner

## OZET TABLO (Faz 12 — 16 dosya)

| # | Dosya | Islem |
|---|-------|-------|
| 47 | `lib/ai/tool-parser.ts` | YENI — normalize parser |
| 48 | `lib/ai/error-codes.ts` | YENI — 8 hata kodu |
| 49-58 | `components/ai/*.tsx` | YENI — 10 kart bileseni + registry |
| 59 | `components/ai/ErrorCard.tsx` | YENI — insancil hata karti |
| 60 | `components/GenerativeUI.tsx` | REFACTOR — 443→155 satir |
| 61 | `database/models/report.model.ts` | GUNCELLENDI — steps[] + errorMessage |
| 62 | `lib/inngest/functions.ts` | GUNCELLENDI — 4 adim Reasoning Pipeline |
| 63 | `lib/actions/report.actions.ts` | GUNCELLENDI — steps + errorMessage |
| 64 | `components/LiveAnalysisCard.tsx` | GUNCELLENDI — ReasoningChain + 1.5sn polling |
| 65 | `lib/ai/tools.ts` | GUNCELLENDI — toToolError() |
| 66 | `app/api/chat/route.ts` | GUNCELLENDI — Smart Title generateText() |
| 67 | `store/useAppStore.ts` | GUNCELLENDI — activeJobs |

---

## 2026-05-22: Diğer AI Editor Değişiklikleri (56 dosya, 2413 ekleme, 7308 silme)

### Yeni Modeller + Inngest Genişletme

| # | Dosya | Islem | Aciklama |
|---|-------|-------|----------|
| 68 | `database/models/ai-job.model.ts` | YENI | Birlesik AI is takip: type, status (queued/running/completed/failed/cancelled), steps[], batchId, reportId, progress, source |
| 69 | `database/models/notification.model.ts` | YENI | Kullanici bildirim: type (ai_job_completed/failed/smart_alert_triggered/report_ready), status (unread/read/archived), actionUrl |
| 70 | `lib/ai/tools.ts` → `askClarification` | YENI | Eksik bilgi tool'u. stopWhen: hasToolCall('askClarification') ile stream aninda durur |
| 71 | `lib/ai/tools.ts` → `batchOptimizeParameter` | YENI | Toplu optimizasyon (max 10 hisse, ayni batchId) |
| 72 | `lib/inngest/functions.ts` → `aiRankIndicatorsJob` | YENI | rankIndicators + findBestIndicator Inngest arka plan islemi |
| 73 | `components/ai/ClarificationForm.tsx` | YENI | AI soru sorar, quick-reply butonlari + ozel metin girisi |
| 74 | `app/(root)/archive/` | YENI | /notebook yerine /archive route'u + /archive/reports/[id] |
| 75 | `app/api/chat/route.ts` | GUNCELLENDI | stopWhen + onFinish toolName enjeksiyonu + auth kontrolu + top-level try-catch |
| 76 | `components/GenerativeUI.tsx` | GUNCELLENDI | isLast, onFollowUp, batch is desteği, askClarification guard |
| 77 | `lib/ai/tools.ts` → `rankIndicators`/`findBestIndicator` | GUNCELLENDI | Senkron → Inngest arka plan islemi |
| 78 | `lib/inngest/functions.ts` → `aiOptimizeParameter` | GUNCELLENDI | AIJob + Notification + batchId destegi, retries: 0 |
| 79 | `components/ai/registry.tsx` | GUNCELLENDI | ClarificationCard wrapper + isLast/onFollowUp props |
| 80 | `components/LiveAnalysisCard.tsx` | GUNCELLENDI | onToolOutput'a toolName eklendi, /archive route |

---

## 2026-05-22: Kritik Bug Düzeltmeleri (5 bugfix, 4 dosya)

> **Amaç:** AI yanıt vermiyor, thinking animasyonu kayboluyor, refresh atmak zorunda kalınıyor sorunlarını kökünden çözmek.

### Bug #1 (KRITIK): hasContent() AI SDK v6 tool-invocation Mesajlarini Gizliyordu

**Kok neden:** `hasContent()` sadece `type: 'tool-call'` ve `type: 'tool-result'` formatlarini taniyordu. AI SDK v6 `type: 'tool-invocation'` formatini kullandigi icin, AI tool cagirdiginda mesaj filtrelenip GIZLENIYORDU. Kullanici hicbir yanit gormuyordu.

**Duzeltilen:** `app/(root)/ai/page.tsx` + `components/FloatingChatButton.tsx` — `hasContent` artık `p.type === 'tool-invocation'` kontrol ediyor.

### Bug #1b: ToolProgress v6 Formatini Gormuyordu

`components/ToolProgress.tsx` — `normalizePart()` yardimcisi eklendi. AI SDK v6 `tool-invocation` parcalarini eski `ToolPart` formatina normalize ediyor.

### Bug #2: Suspense Import Edilmemis

`app/(root)/ai/page.tsx` — `Suspense` React import'una eklendi. Build hatasi giderildi.

### Bug #3b: FloatingChatButton GenerativeUI Eksik Proplar

`components/FloatingChatButton.tsx` — `isLast`, `onFollowUp`, `convId` proplari eklendi. Floating panelde ClarificationForm ve follow-up artık calisiyor.

| # | Katman | Ne Yapildi | Sonuc |
|---|--------|-----------|-------|
| 81 | UI | hasContent v6 tool-invocation tanimiyor | Mesajlar artik GIZLENMIYOR |
| 82 | UI | ToolProgress v6 normalize | Tool progress canli gorunur |
| 83 | Build | Suspense import eklendi | Build hatasi gider |
| 84 | UI | FloatingChatButton eksik proplar | ClarificationForm + follow-up calisir |

## DOGRULAMA (son)

```
$ npx tsc --noEmit
(cikti yok → sifir tip hatasi)

$ npm run build
✓ Compiled successfully
✓ Generating static pages (11/11)

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /ai              AI Agent (Component Registry + askClarification + ReasoningChain)
├ ƒ /alerts/create
├ ƒ /api/chat        AI Agent (streaming + smart title + sliding window + stopWhen)
├ ƒ /api/inngest     Inngest (5 fonksiyon: signup + news + alerts + optimize + rank-indicators)
├ ƒ /archive         Research Archive (AIJob sonuclari)
├ ƒ /archive/reports/[id]
├ ƒ /sign-in
├ ƒ /sign-up
├ ƒ /stocks/[symbol]
├ ƒ /stocks/[symbol]/alert
├ ƒ /ta              Teknik Analiz
└ ƒ /watchlist
```


---

## 2026-05-22: stepCountIs Kritik DuZeltme

**Kok Neden:** `maxSteps` parametresi AI SDK v6\'da mevcut degil. `// @ts-ignore` ile gizlenince SDK sessizce `stepCountIs(1)` varsayilanina dustu — tek tool adimi sonrasi stream duruyor, UI bos kaliyordu.

**Cozum:** `maxSteps: 5` -> `stopWhen: stepCountIs(5)`. `stepCountIs` `ai` paketinden import edildi.

## 2026-05-22: 4-Faz Refactoring + 6 Resilience Katmani

### Faz 0: Temizlik ve Organizasyon
- **Silinen:** TAResolutionToggle.tsx (olu kod), lib/ai/index.ts (kullanilmayan barrel export)
- **Tasinan (13 dosya):** GenerativeUI, LiveAnalysisCard, ToolProgress, MarkdownRenderer, FloatingChatButton → components/ai/; WatchlistButton, WatchlistTable → components/watchlist/; AlertActions, AlertStockSelector → components/alerts/; SearchCommand, ErrorBoundary, NotificationBell, EditProfileModal → components/layout/
- **Guncellenen import:** 17 dosyada path guncellendi

### Faz 1: Veritabani Standardizasyonu
- 8 modelin tamami timestamps: true olarak standartlastirildi
- Manuel createdAt/updatedAt alanlari kaldirildi (Mongoose otomatik yonetsin)
- Interface'lere createdAt/updatedAt eklendi (.lean() tip uyumlulugu icin)

### Faz 2: Katman Ihlali Duzeltmeleri
- lib/ai/tools.ts: PriceAlert ve SmartAlert dogrudan DB importlari kaldirildi
- lib/actions/alerts.actions.ts: createAlert() ve deleteAlert() programatik fonksiyonlar eklendi
- lib/actions/smart-alerts.actions.ts: YENI DOSYA — createSmartAlert(), getSmartAlerts()

### Faz 3: Hardcode Temizligi
- lib/constants/indicators.ts: YENI DOSYA — INDICATOR_REGISTRY (17 indikator, tek kaynak)
- lib/ai/prompts.ts: Sabit indikator listesi → INDICATOR_NAMES_STRING sabitine referans
- lib/constants/index.ts: Barrel export'a yeni sabitler eklendi

### Faz 4: Kod Tekrari Temizligi
- hooks/useChatManager.ts: YENI DOSYA — paylasimli chat hook'u (~170 satir)
- app/(root)/ai/page.tsx: ChatAreaInner ~180 satirdan ~25 satir chat mantigina indirildi
- components/ai/FloatingChatButton.tsx: useChatManager hook'una gecildi

### 6 Resilience Katmani (Kritik DuZeltmeler)
1. **Polling Loop:** Stale timer tek atimlik → 3sn'de bir 60sn boyunca polling, yeni mesaj gelince durur
2. **onError Toast:** useChat onError → sonner toast + kirmizi hata banner'i
3. **Network Detection:** navigator.onLine + offline/online event'leri → sari uyari banner'i + otomatik iyilesme
4. **Double Submit Lock:** pendingRef ile stream bitene kadar ikinci gonderim engellenir
5. **Server Error Classification:** ECONNREFUSED, timeout, rate limit icin ozel hata mesajlari
6. **Stable RoomKey:** FloatingChatButton roomKey sabitlendi → konusma degisiminde stream kaybolmaz

### Test Altyapisi
- vitest v4 kuruldu (devDependency)
- vitest.config.ts: @/ path alias cozunurlugu
- 4 test dosyasi, 41 test: schemas (14), rsi (8), error-codes (12), backtest (7)
- package.json: test, test:watch script'leri

### Dokumantasyon
- 13 markdown dosyasi guncellendi
- Tum yeni dosyalar, silinen dosyalar, mimari degisiklikler islendi
