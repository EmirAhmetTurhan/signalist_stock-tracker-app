# Diğer Yapay Zeka Editörlerine Atılacak Prompt

> **Kullanım:** Bu prompt'u ve `STRATEGY_ANALYSIS_PLAN.md` dosyasını birlikte herhangi bir AI modele (Claude, GPT, Gemini vb.) gönderebilirsin.

---

## Kopyala-Yapıştır Promptu

```
Sana bir hisse senedi strateji uygulamasının teknik dokümanını atıyorum. Bu uygulama 17 farklı
teknik indikatörle (RSI, MACD, WaveTrend, Bollinger, DMI vb.) al/sat sinyali üretiyor ve bunları
backtest ediyor.

MEVCUT PROBLEM:
- Sistem "Look-Forward" mantığıyla çalışıyor: Sinyal üretildikten sonra sadece 14. gündeki fiyata
  bakıp Win/Loss diyor. Aradaki 13 günde fiyat %50 düşse bile umursamıyor.
- "All Agree" (tüm indikatörler aynı fikirde) şartıyla ayda sadece 1-2 sinyal alınıyor. Kullanıcı
  swing trade yapmak istiyor, bu sinyal sıklığı çok düşük.
- İndikatörlerin farklı piyasa koşullarında (yükseliş, düşüş, yatay, volatil) farklı performans
  gösterdiği gerçeği modellenmiyor.

İSTENEN YENİ YAKLAŞIM:
1. Önce 10 yıllık fiyat verisini tarayıp "piyasa anatomisini" çıkar:
   - Nerede yükseliş trendi olmuş?
   - Nerede düşüş trendi olmuş?
   - Nerede yatay (konsolidasyon) kalmış?
   - Nerede ani patlama/çöküş olmuş?

2. Sonra bu tespit edilen trend başlangıç noktalarında geriye dönük bak:
   - "Bu yükseliş başlarken hangi indikatörler doğru sinyal vermiş?"
   - "Bu düşüşü kim önceden haber vermiş?"

3. Sonuç olarak her piyasa tipi için en uygun indikatör kombinasyonunu belirle.

SORULARIM SANA:
1. Bu yaklaşım (fiyat rejimi tespiti + tersine mühendislik) mantıklı mı? Avantajları ve riskleri
   neler?

2. Fiyat rejimlerini (uptrend, downtrend, ranging, volatile) matematiksel olarak tespit etmek
   için nasıl bir yöntem önerirsin? Hangi eşik değerleri, hangi formüller kullanılmalı?

3. Mevcut sistemdeki Dempster-Shafer Theory (DST) füzyon mantığı korunmalı mı, yoksa rejim
   tespit edildikten sonra farklı bir sinyal mantığı mı kullanılmalı?

4. Bu sistem değişikliğini adım adım nasıl implemente ederdin? İlk önce hangi modül yazılmalı?

5. Bu yaklaşımın en büyük handikapı ne olur? Overfitting riski nasıl yönetilir?

Dokümanı inceleyip düşüncelerini paylaşır mısın?
```

---

## Prompt Hakkında Notlar

- Bu prompt, raporun **sadece konseptini** sorar. Kod detaylarına girmez.
- Diğer AI'dan kod yazmasını değil, **fikir ve yaklaşım değerlendirmesi** yapmasını ister.
- 5 soru, tartışmayı yönlendirmek için yeterince spesifik ama açık uçludur.
- İstersen prompt'un sonuna `STRATEGY_ANALYSIS_PLAN.md`'in **sadece 4. ve 5. bölümlerini** (Yeni Vizyon + Soru-Cevap) ekleyerek token tasarrufu yapabilirsin.