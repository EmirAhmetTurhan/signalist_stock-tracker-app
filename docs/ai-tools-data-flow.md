# AI Agent: Araçlar (Tools) ve Veri Akış Mimarisi Raporu

Bu doküman, Signalist platformundaki Yapay Zeka (AI) Asistanının kullandığı **18 adet aracın (tool)** girdilerini, çıktılarını, veriyi nereden aldığını ve işlemlerin fiziksel olarak nerede (sunucu, veritabanı, Inngest arka plan işçisi) yürütüldüğünü detaylandırmaktadır.

---

## 1. Veri İşleyişi: Akış (Data Flow) Nerede Gerçekleşiyor?

Sistemde veri işleyişi iki ana kulvara ayrılmıştır: **Senkron (Hafif) İşlemler** ve **Asenkron (Ağır) İşlemler**.

### A. Senkron Veri Akışı (Hafif Araçlar)
Kullanıcı basit bir hisse fiyatı veya portföy bilgisi sorduğunda çalışan akıştır.
1. **Frontend:** Kullanıcı isteği (`POST /api/chat`) atar.
2. **Sunucu (Vercel API Route):** LLM, hafif bir aracı çağırır (örneğin `getCurrentPrice` veya `getWatchlist`).
3. **Veri Kaynağı:** 
   - Finansal veri ise doğrudan Vercel sunucusundan **Finnhub API**'sine (veya Yahoo Finance) istek atılır.
   - Kullanıcı verisi ise doğrudan **MongoDB** (`Watchlist`, `PriceAlert` koleksiyonları) sorgulanır.
4. **İşlem:** Veri alınır alınmaz Vercel sunucusu üzerinde saniyeler içinde işlenip LLM'e geri verilir ve LLM yanıtı stream olarak Frontend'e aktarılır. Bütün bu işlem ana API thread'i üzerinde, kullanıcı beklerken gerçekleşir.

### B. Asenkron Veri Akışı (Ağır Araçlar - Inngest)
Kullanıcı geriye dönük (backtest) veya binlerce hesaplama gerektiren optimizasyon istediğinde çalışan akıştır (örneğin `optimizeParameter`, `batchOptimizeParameter`, `rankIndicators`).
1. **Sunucu (Vercel API Route):** LLM bu araçlardan birini çağırdığında araç **hemen çalışmaz**. Inngest olay kuyruğuna (event queue) bir mesaj bırakır ve LLM'e "Arka planda başlattım" (`isBackgroundJob: true`) yanıtını döner. Kullanıcıya stream kapanır.
2. **Inngest Worker (Arka Plan Sunucusu):** Olayı kuyruktan alır ve `lib/inngest/functions.ts` dosyasındaki asıl ağır hesaplamayı başlatır.
3. **Veri Kaynağı:**
   - Inngest Worker, geçmiş mum (candle) verilerini toplu olarak **Finnhub API**'den çeker (Örn: 3650 günlük veri).
4. **Hesaplama (Compute):** Tüm `computeIndicators`, `generateAllSignals` veya döngüsel `findBestParameter` (brute-force) işlemleri **Inngest Worker sunucusunun RAM/CPU'sunda** gerçekleşir. Ana web sunucusunu yormaz.
5. **Kayıt (MongoDB):** İşlem sırasındaki aşamalar (ilerleme) `AIJob` koleksiyonuna, nihai sonuçlar ise `Report` koleksiyonuna yazılır.
6. **Frontend Polling & Component Registry:** Client (`useChatManager` hook'u) her 1.5 saniyede bir MongoDB'deki `AIJob` kaydını dinler. İşlem bittiğinde `addToolOutput` tetiklenir, `Report` sonucu veritabanından çekilir ve `TOOL_COMPONENT_MAP` üzerinden dinamik olarak doğru UI kartı (örn. BacktestResultCard) ekrana çizilir.

---

## 2. Araç (Tool) Envanteri ve Veri Tipleri (18 Adet)

### [SİSTEM ARAÇLARI]

#### 1. `askClarification` (Eksik Bilgi Sorma)
- **Veri Akışı:** Sistem İçi. LLM veriyi eksik bulduğunda bu aracı çağırarak Frontend'de bir form render edilmesini sağlar.
- **Girdi (Input):** `{ missingFields: string[], question: string, options: string[] }`
- **Çıktı (Output):** `{ success: true, isClarification: true, missingFields, question, options }`

---

### [TEKNİK ANALİZ ARAÇLARI - Senkron]

#### 2. `analyzeIndicators` (Mevcut Durum Analizi)
- **Veri Akışı:** Vercel Sunucusu $\rightarrow$ Finnhub API (Mum verisi çekimi) $\rightarrow$ Sunucu (İndikatör ve Sinyal Hesaplaması). Arka plana atılmaz, anında döner (Timeout: 30sn).
- **Girdi:** `{ symbol: string, interval: '1d'|'4h', indicators: string[], years: number }`
- **Çıktı:** `{ success: true, symbol: "AAPL", candleCount: 365, overallSignal: "STRONG BUY", overallScore: 8.5, signals: [...], evaluationText: "..." }`

#### 3. `getCurrentPrice` (Anlık Fiyat)
- **Veri Akışı:** Vercel Sunucusu $\rightarrow$ Finnhub Quote API. 
- **Girdi:** `{ symbol: string }`
- **Çıktı:** `{ success: true, symbol: "AAPL", price: 150.25, changePercent: 1.5 }`

---

### [ARAŞTIRMA VE OPTİMİZASYON ARAÇLARI - Asenkron/Ağır]
*Not: Bu araçların tamamı LLM'e sadece bir `jobId` döner. Asıl çıktı saat/dakika sonra Inngest tarafından MongoDB'ye `Report` modelinde yazılır.*

#### 4. `runBacktest` (Senkron Backtest)
- **Veri Akışı:** Vercel Sunucusu $\rightarrow$ Finnhub API $\rightarrow$ Matematiksel Hesaplama (Senkron).
- **Girdi:** `{ symbol: string, indicator: string, interval: '1d'|'4h', lookForward: number, years: number }`
- **Çıktı (Doğrudan):** `{ success: true, symbol: "AAPL", winRate: 65.5, totalSignals: 120, wins: 78 }`

#### 5. `optimizeParameter` (Tekli Parametre Optimizasyonu)
- **Veri Akışı:** Inngest Worker $\rightarrow$ Finnhub API $\rightarrow$ Brute-force Hesaplama (Inngest) $\rightarrow$ MongoDB `Report`.
- **Girdi:** `{ symbol: string, indicator: string, interval: '1d'|'4h', years: number }`
- **Çıktı (LLM'e dönen):** `{ success: true, isBackgroundJob: true, jobId: "uuid", message: "Arka planda başlattım..." }`
- **Nihai Çıktı (MongoDB `Report.fullData`):** `{ bestValue: 14, winRate: 72.3, parameter: "Period" }`

#### 6. `batchOptimizeParameter` (Çoklu Optimizasyon)
- **Veri Akışı:** Inngest Worker (Paralel) $\rightarrow$ Her hisse için ayrı `ai/optimize-parameter` event'i fırlatılır.
- **Girdi:** `{ symbols: string[], indicator: string, interval: '1d'|'4h', years: number }`
- **Çıktı (LLM'e dönen):** `{ success: true, isBackgroundJob: true, isBatchJob: true, jobIds: ["uuid1", "uuid2"] }`

#### 7. `rankIndicators` (İndikatörleri Sıralama)
- **Veri Akışı:** Inngest Worker $\rightarrow$ Finnhub $\rightarrow$ Tüm İndikatörlerin Backtest'i $\rightarrow$ MongoDB `Report`.
- **Girdi:** `{ symbol: string, interval: string, indicators?: string[], years: number, topN: number }`
- **Çıktı (LLM'e dönen):** `{ success: true, isBackgroundJob: true, jobId: "uuid", indicator: "RANK" }`
- **Nihai Çıktı (MongoDB `Report.fullData`):** Tüm indikatörlerin win-rate sıralaması listesi.

#### 8. `findBestIndicator` (En İyi İndikatörü Bulma)
- **Veri Akışı:** `rankIndicators` ile tamamen aynı Inngest event'ini kullanır, sadece parametre olarak `isSingle: true` yollar ve en yüksek `winRate`'e sahip ilk elemanı Report tablosuna atar.
- **Girdi:** `{ symbol: string, interval: string, years: number, topN: number }`
- **Çıktı (LLM'e dönen):** `{ success: true, isBackgroundJob: true, jobId: "uuid", indicator: "FIND_BEST" }`

---

### [KULLANICI VERİSİ ARAÇLARI - Senkron]
*Not: Tamamı Vercel üzerinden MongoDB okuma/yazma işlemleri yapar.*

#### 9. `getWatchlist` (İzleme Listesini Getir)
- **Girdi:** Boş Obje `{}`
- **Çıktı:** `{ success: true, count: 5, items: [{ symbol: "AAPL", company: "Apple", price: "$150", change: "%1.2" }] }`

#### 10. `addToWatchlist` (İzleme Listesine Ekle)
- **Girdi:** `{ symbol: string, company: string }`
- **Çıktı:** `{ success: true, symbol: "AAPL", message: "Eklendi" }`

#### 11. `removeFromWatchlist` (İzleme Listesinden Çıkar)
- **Girdi:** `{ symbol: string }`
- **Çıktı:** `{ success: true, symbol: "AAPL", message: "Çıkarıldı" }`

#### 12. `createPriceAlert` (Fiyat Alarmı Kur)
- **Girdi:** `{ symbol: string, company: string, alertName: string, alertType: 'upper'|'lower', threshold: number }`
- **Çıktı:** `{ success: true, message: "Alarm oluşturuldu" }`

#### 13. `deletePriceAlert` (Fiyat Alarmı Sil)
- **Girdi:** `{ symbol: string }`
- **Çıktı:** `{ success: true, message: "Alarm silindi" }`

#### 14. `getUserAlerts` (Alarmları Listele)
- **Girdi:** Boş Obje `{}`
- **Çıktı:** `{ success: true, count: 2, alerts: [{ symbol: "AAPL", threshold: 160, alertType: "upper", active: true }] }`

#### 15. `createSmartAlert` (Stratejik Alarm Kur)
- **Girdi:** `{ name: string, symbol: string, interval: string, frequency: string, conditions: [...] }`
- **Çıktı:** `{ success: true, message: "Stratejik alarm oluşturuldu" }`

#### 16. `getSmartAlerts` (Stratejik Alarmları Listele)
- **Girdi:** `{ symbol?: string }`
- **Çıktı:** `{ success: true, alerts: [ ... ], count: 1 }`

---

### [ARAMA VE HABER ARAÇLARI - Senkron]

#### 17. `searchStock` (Hisse Ara)
- **Veri Akışı:** Vercel $\rightarrow$ Finnhub (Symbol Search API)
- **Girdi:** `{ query: string }`
- **Çıktı:** `{ success: true, results: [{ symbol: "TSLA", name: "Tesla Inc", country: "US" }] }`

#### 18. `getMarketNews` (Piyasa/Hisse Haberleri)
- **Veri Akışı:** Vercel $\rightarrow$ Finnhub (Market News API)
- **Girdi:** `{ symbol?: string }`
- **Çıktı:** `{ success: true, articles: [{ headline: "...", summary: "...", url: "..." }] }`
