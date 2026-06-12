# PORTFOLIO_SIMULATION_ARCHITECTURE

> **Kurumsal Strateji Simülasyon Motoru ve Laboratuvarı - Temel Mimari Prensipleri ve Kararlar**
> *Bu belge, Portfolio modülünün dönüşüm sürecinde sistem mimarisi, veri yönetimi ve finansal hesaplama kurallarını tanımlayan anayasadır.*

---

## 1. Amaç ve Felsefe (İki Ayrı Dünya)

Platformumuz, kullanıcı hedeflerine göre net bir şekilde iki farklı ekosisteme ayrılmaktadır:

*   **Paper Trading (Canlı/İleriye Dönük):** Kullanıcıların gerçek zamanlı veya gün sonu fiyat hareketleriyle canlı piyasa koşullarında sanal işlem yaptıkları cüzdan yapısıdır. Mevcut piyasa psikolojisini ve anlık karar alma süreçlerini simüle eder.
*   **Simulation Lab (Geçmişe Dönük):** Kullanıcıların keşfettikleri veya tasarladıkları stratejileri (parametreler, indikatörler, risk profilleri), **10 yıllık** geçmiş fiyat verisi üzerinde test ettikleri kantitatif analiz laboratuvarıdır. Deterministik DST (Dempster-Shafer Theory) Fusion motorumuz kullanılarak, stratejinin işlem geçmişi saniyesi saniyesine %100 aslına uygun şekilde laboratuvar ortamında yeniden üretilir.

## 2. Entity'ler (Domain Modeli) ve Çift Taraflı Defter (Double-Entry)

Finansal bütünlüğün ve izlenebilirliğin sağlanması için aşağıdaki çekirdek Entity modelleri tasarlanacaktır:

*   **`Wallet`:** Canlı paper trading veya geçmişe dönük simülasyon portföyünün ana bakiyesini tutan üst birim.
*   **`Position`:** Bir varlıktaki mevcut açık durumları ve trade geçmişini kapsayan pozisyon birimi.
*   **`Transaction`:** Para yatırma, çekme, alım-satım, temettü gibi her türlü hesap hareketini içeren finansal işlem kaydı.
*   **`Simulation`:** Laboratuvar ortamındaki geçmişe dönük bir test senaryosunun (başlangıç sermayesi, tarih aralığı vb.) ana kapsayıcısı.
*   **`SimulationSnapshot`:** Simülasyonun zaman serisi içerisindeki belirli anlarda portföy durumunu (Equity Curve) gösteren veri blokları.
*   **`StrategySnapshot`:** Simülasyona baz oluşturan stratejinin dondurulmuş bir kopyası.

> [!CAUTION]
> **Muhasebe Kuralı (Immutable Ledger):** `Transaction` kayıtları ASLA ve ASLA silinemez veya modifiye edilemez. Finansal veri tutarlılığı gereği, hatalı işlemler sadece **'Reversal' (Ters Kayıt)** girilerek muhasebeleştirilebilir.

## 3. Veri Akışı ve Inngest Chunking

Sistemin veri akış yönü şu şekildedir:
`TA Sayfası` $\rightarrow$ `Archive` $\rightarrow$ `Create Simulation İşlemi` $\rightarrow$ `DST Motoru İcrası` $\rightarrow$ `Snapshot Alımı` $\rightarrow$ `UI Render`

> [!IMPORTANT]
> **Performans Kuralı:** 10 yıllık (yaklaşık 3650 gün/bar) devasa bir veri seti tek bir CPU thread'inde veya API request lifecycle'ında hesaplanamaz. 
> RAM taşmasını (Out of Memory - OOM) önlemek ve sistemi non-blocking tutmak için arka planda **Inngest** kullanılacaktır. İşlemler **'Chunking'** mantığıyla belirli parçalara (örneğin aylık veya 6 aylık veri bloklarına) bölünecek ve Inngest background job'ları vasıtasıyla sırayla yield edilerek işlenecektir.

## 4. Performance & Caching (Sync Policy)

Geçmiş testlerin (backtest) her seferinde yeniden hesaplanması kabul edilemez bir yük oluşturacaktır:

*   **İlk Çalıştırma:** Simülasyonlar her sayfa açıldığında Finnhub API'sine gidilerek veya baştan hesaplanarak oluşturulmaz. İlk işlem sonucunda oluşturulan **SimulationSnapshot (Equity Curve dizisi)** MongoDB'ye kaydedilir ve arayüze veri bu statik katmandan servis edilir.
*   **Incremental Sync (Kaldığı Yerden Devam):** Kullanıcı yeni veri almak için 'Sync' talebi gönderdiğinde motor sıfırdan hesaplama yapmaz. `lastProcessedBarIndex` veya `lastProcessedDate` baz alınarak, sadece aradaki eksik günler (örneğin son 3 gün) için Incremental hesaplama yapılır ve state'e eklenir.

## 5. Versioning (Sürüm Kontrolü) ve Immutable Snapshots

Gelecekte algoritma veya motor tarafında yapılacak değişikliklerin geçmiş laboratuvar sonuçlarını etkilememesi için kesin izolasyon kuralları uygulanır:

*   **Engine Versioning:** Her simülasyon hangi motor sürümüyle hesaplandıysa o sürümün etiketini (`engineVersion`, Örn: `1.4.0-Faz4`) taşır. Motor değişirse, eski simülasyonlar eski motor mantığı (veya dondurulmuş sonuçlar) üzerinden varlığını korur.
*   **StrategySnapshot Kuralı:** Bir simülasyon başlatıldığı o ilk saniyede, referans alınan stratejinin o anki parametreleri, indicator değerleri, bestParams ayarları ve risk profili **JSON olarak klonlanır ve dondurulur**. Orijinal strateji daha sonra Archive'dan silinse dahi, simülasyon hesaplaması için gerekli parametreler `StrategySnapshot` içinde izole kalır ve matematik asla bozulmaz.

## 6. Position Sizing (Pozisyon Boyutlandırma Motoru)

Kullanıcıların laboratuvar ortamında kasanın/portföyün nasıl yönetileceğini seçmesi adına, sistem çeşitli kantitatif modeller sunar:

*   **All-In (Tüm Kasa):** Mevcut nakit ve serbest marjın tamamının tek işlemde kullanılması.
*   **Fixed Fractional:** Her bir işlemde (trade) toplam kasanın sabit bir yüzdesinin (Örn: %10) işleme tahsis edilmesi.
*   **Risk-Based:** Alınacak pozisyon boyutunun, stop-loss mesafesine oranlanarak portföyün sadece maksimum belirli bir yüzdesini (Örn: %1 Risk) riske atacak şekilde dinamik hesaplanması.
*   **Half-Kelly:** Optimal büyüme ile riskin dengelendiği, kantitatif finans standartlarında sıklıkla tercih edilen Kelly Kriteri'nin daha güvenli varyantı.

## 7. Kritik Edge Cases (Uç Durumlar - Kurumsal Korumalar)

Kurumsal kalitede bir motorun, uç piyasa koşullarına ve veri anormalliklerine karşı bağışıklığı olmalıdır:

*   **Bankruptcy (İflas - Circuit Breaker):** İflas durumu yalnızca Cash (Nakit) $\lt$ 0 olduğunda değil; `Total Equity (Nakit + Açık Pozisyonların Mevcut Değeri) <= 0` olduğunda devre kesici olarak tetiklenir. Bu durumda sistem anında **'Force Liquidation' (Zorunlu Tasfiye)** uygulayarak tüm pozisyonları kapatır.
*   **Deposit / Withdraw (Sermaye Ekleme/Çekme):** Simülasyonun veya canlı hesabın ortasında cüzdana para eklenmesi/çıkarılması durumunda kâr/zarar (% ROI) grafiğinin bozulmaması şarttır. Bunun engellenmesi için endüstri standardı olan **TWR (Time-Weighted Return - Zaman Ağırlıklı Getiri)** algoritması entegre edilerek performans hesaplanacaktır.
*   **Missing Data (Eksik Veri Yönetimi):** Finnhub veya farklı bir sağlayıcı çökerse ya da veri akışı kesilirse motor durmaz veya 'Exception' fırlatıp çökmez. **'Forward-Fill & Halt'** kuralı işler: Son geçerli piyasa fiyatı (Last Price) bir sonraki bar(lar) için ileri kopyalanır ancak portföy yeni bir işlem açmayı otomatik olarak durdurur.
*   **Delisted Stocks:** Simülasyon dahilindeki bir hisse senedi borsadan atılırsa (delisted), hissenin değeri anında sıfırlanmış sayılır. Pozisyon **$0.00** fiyatından Ledger'a zarar olarak işlenir ve kapatılır.

---
*İmza: Senior Quantitative Systems Architect*
