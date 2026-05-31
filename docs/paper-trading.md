# Paper Trading (Sanal Para) ve Auto-Execution Mimarisi

Bu doküman, Signalist uygulamasına entegre edilen "Paper Trading" (Sanal Para ile İşlem) ve "Auto-Execution" (Otomatik Algoritmik İşlem) mimarisinin tüm detaylarını açıklar. Sistem, kullanıcıların sanal bakiye ile manuel hisse senedi alıp satmalarını, stratejilerini "Shadow Mode" (Gölge Modu) ile test etmelerini ve yapay zeka entegrasyonu ile işlem yapmalarını sağlar.

## 1. Temel Mimarisi ve Veritabanı (MongoDB)
Tüm bakiye, portföy ve emir yönetimleri MongoDB üzerinde şemalandırılmıştır. Bakiye güvenliği için ondalık sayılarda `Number` yerine MongoDB'nin **`Decimal128`** veri tipi kullanılmıştır. İşlemler `mongoose.startSession()` ile **Transactions (İşlemler)** kullanılarak tamamen izole ve ACID uyumlu hale getirilmiştir.

### Temel Koleksiyonlar:
1. **Wallet (Cüzdan):** Kullanıcının nakit bakiyesi (`cashBalance`), bekleyen emirler için bloke edilen bakiyesi (`reservedBalance`) ve başlangıç sermayesini tutar.
2. **Position (Açık Pozisyon):** Kullanıcının sahip olduğu hisseleri tutar. `quantity`, `reservedQuantity` (bekleyen satış emirleri için bloke edilen hisse adedi) ve `avgEntryPrice` bilgilerini içerir.
3. **PendingOrder (Bekleyen Emir):** Limit, Stop-Loss, Take-Profit veya Market-On-Open emirlerini barındırır.
4. **Trade (İşlem Geçmişi / Defter):** Gerçekleşen her alım-satım işlemini değişmez bir log olarak tutar. (Ledger mantığı)
5. **ForwardTestStrategy (İleriye Dönük Test):** AI Strateji simülasyonlarını tutar. `executionMode` (shadow, auto) ve durum (`running`, `paused`) bilgilerini içerir.

## 2. Execution Engine (İşlem Motoru)
Uygulamanın kalbi `lib/paper-trading/execution-engine.ts` dosyasıdır. Tüm emirler (ister manuel, ister AI, ister otomatik strateji olsun) bu motordan geçer.

**Savunma Hatları:**
1. **Slippage (Fiyat Kayması):** Kullanıcının anlık fiyatına `5 bps (0.05%)` slippage eklenir. Alırken pahalı, satarken ucuz fiyattan işlem gerçekleşir.
2. **Decimal İşlemleri:** Kayan nokta (floating point) hatalarını engellemek için tüm işlemler `decimal-utils.ts` üzerinden `Decimal.js` mantığı ile hesaplanır.
3. **Market Saatleri:** Piyasanın açık olup olmadığı `lib/constants/market-calendar.ts` üzerinden kontrol edilir. İşlem piyasa kapalıyken gelirse, `MARKET_CLOSED` hatası döner veya otomatik olarak ertesi açılış için `market_on_open` emrine dönüştürülür. ABD DST (Daylight Saving Time) saat farkları ve resmi NYSE tatilleri (10 büyük tatil) statik olarak tanımlanmıştır.
4. **Stale Quotes (Eski Fiyatlar):** Anlık çekilen fiyat, bir önceki günün kapanış fiyatından %50'den fazla farklıysa (muhtemelen API hatası veya aşırı dalgalanma) sistem işlemi reddeder.

## 3. Risk Yönetimi (Risk Caps)
Otomatik işlem modunda (Auto-Execution) kullanıcının parasını korumak için sistem düzeyinde engeller (Risk Caps) vardır:
- **`maxPositionPercent` (%20):** Hiçbir tekil pozisyon, toplam portföy değerinin %20'sini aşamaz.
- **`maxOpenPositions` (10):** Kullanıcı aynı anda en fazla 10 farklı hissede pozisyon açabilir.
- **`maxDailyLossPercent` (%5):** Günlük gerçekleşen zarar %5'i aşarsa, sistem devre kesiciyi (`circuitBreakerTriggered`) aktif eder ve o gün için yeni alımları tamamen durdurur.

## 4. Bekleyen Emirler (Pending Orders) ve Rezerve Mekanizması
Limit emirler Inngest üzerinden her 15 dakikada bir piyasa açıkken (`evaluatePendingOrdersJob`) kontrol edilir.
- **Wick-Blindness Çözümü:** 15 dakikada bir anlık fiyat (`quote`) çekmek yerine, son 15 dakikanın **15-minute Intraday OHLCV** mumları çekilir. Eğer hedeflenen fiyat, mumun `Low` ve `High` değerleri arasındaysa emir gerçekleşmiş sayılır.
- **Rezerve Mantığı:** Bir alım limit emri girildiğinde, cüzdandaki nakit `reservedBalance`'a taşınır. Bir satış limit emri girildiğinde, `Position`'daki hisse adedi `reservedQuantity` içine atılır. Bu, kullanıcının aynı parayla veya hisseyle iki kez işlem yapmasını (Double-Spend) engeller.

## 5. Kurumsal İşlemler (Corporate Actions)
Şirketlerin temettü ödemeleri veya bölünmeleri kullanıcı portföyünü doğrudan etkiler. Bu yüzden her gece UTC 00:00'da çalışan bir `processCorporateActionsJob` (Inngest) cron job'ı eklenmiştir.
- **Temettü (Dividends):** Finnhub'dan ex-date tarihi kontrol edilir. Eğer kullanıcı hisseyi ex-date öncesinden beri elinde tutuyorsa, hisse başı temettü miktarı kadar nakit `cashBalance`'a aktarılır ve bildirim gönderilir.
- **Bölünmeler (Stock Splits):** Hisseler bölündüğünde (örneğin 2:1), sistem otomatik olarak pozisyon adetlerini 2 ile çarpar, maliyeti 2'ye böler. Aynı işlem bekleyen emirlerin hedef fiyatlarına ve adetlerine de retroaktif olarak yansıtılır.
- **Delistings (Borsadan Çıkarma):** `processDelisting` server-action'ı, bir hisse borsadan kaldırıldığında 7 aşamalı bir kapatma prosedürü işletir: Açık pozisyonu zorla kapatır, bekleyen emirleri iptal eder, stratejileri durdurur ve nakdi iade edip bildirim gönderir.

## 6. AI Ticaret Entegrasyonu ve Token Güvenliği (HMAC)
AI asistanı portföy okuma ve işlem önerme yeteneğine sahiptir.

**Geliştirilmiş Tool'lar:**
- `getPortfolioStatus`: Kullanıcının anlık varlıklarını (nakit, hisse senetleri) AI'a okutur.
- `proposeTrade`: AI'ın işlem önermesini sağlar. AI **ASLA** işlemi doğrudan çalıştıramaz.
- `stopForwardTest`: Çalışan bir stratejiyi AI aracılığıyla durdurur.

**Token Güvenliği (5-Layer Defense):**
AI `proposeTrade` aracını çağırdığında sistem işlemi yürütmez. Bunun yerine `lib/ai/token-security.ts` üzerinden bir **HMAC-SHA256 Token** üretir.
Bu token içerisine: `userId, symbol, side, quantity, price, expiresAt (5 dk), nonce` gömülür ve `BETTER_AUTH_SECRET` ile imzalanır.
AI bu token'ı frontend'e gönderir. Ekranda **"Trade Confirmation (Onay)"** kartı çıkar. Kullanıcı onayladığında token server'a gider, imza ve süre (`verifyTradeToken`) doğrulanır. Bu mimari, frontend üzerinde (tarayıcı inspector) fiyat veya adet üzerinde manipülasyon yapılmasını imkansız kılar.
