# Signalist — Kurulum Rehberi

> Bu rehber, Signalist projesini sıfırdan bilgisayarınıza kurmak için adım adım talimatları içerir.

## Gereksinimler

| Araç | Minimum Surum | Kontrol |
|------|---------------|---------|
| Node.js | 20.x+ | `node --version` |
| MongoDB | 7.x+ (Atlas veya local) | — |
| Ollama | latest | `ollama --version` |
| Git | latest | `git --version` |

---

## 1. Projeyi Klonlayın

```bash
git clone https://github.com/<kullanici-adi>/signalist_stock-tracker-app.git
cd signalist_stock-tracker-app
npm install
```

---

## 2. MongoDB Baglantisi

### Secenek A: MongoDB Atlas (Onerilen — ucretsiz tier)

1. https://www.mongodb.com/atlas adresinden hesap olusturun
2. "Create Cluster" → M0 (Free) secin
3. "Database Access" → kullanici adi/sifre olusturun
4. "Network Access" → `0.0.0.0/0` ekleyin (tum IP'lerden erisim)
5. "Connect" → "Drivers" → connection string'i kopyalayin
6. `<username>` ve `<password>` kısımlarını kendi bilgilerinizle degistirin

### Secenek B: Lokal MongoDB

```bash
# macOS
brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
sudo apt install mongodb
sudo systemctl start mongod

# Windows
# https://www.mongodb.com/try/download/community adresinden indirin
```

Lokal MongoDB URI: `mongodb://localhost:27017/signalist`

---

## 3. Yapay Zeka Modeli (Ollama)

Signalist varsayilan olarak **lokal Ollama** kullanir. Ucretsizdir, API key gerektirmez.

```bash
# Ollama'i indirin: https://ollama.com

# Onerilen modeli yukleyin (14B parametre, ~8GB RAM ister):
ollama pull qwen3:14b

# Daha hafif alternatif (3B parametre, ~4GB RAM):
ollama pull qwen3:3b

# En guclu model (30B parametre, ~20GB RAM):
ollama pull qwen3:30b
```

> **Not:** Ollama varsayilan olarak `localhost:11434` portunda calisir. Proje bu porta baglanir.

---

## 4. .env Dosyasini Olusturun

Proje ana dizininde `.env` dosyasi olusturun ve asagidaki degiskenleri doldurun:

```env
# ---- ZORUNLU ----

# MongoDB baglanti adresi
MONGODB_URI=mongodb+srv://kullanici:sifre@cluster.xxxxx.mongodb.net/signalist

# Better Auth (kimlik dogrulama)
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=rastgele-uzun-bir-string-buraya-64-karakter

# Finnhub (borsa verileri — https://finnhub.io adresinden ucretsiz alin)
FINNHUB_API_KEY=your-finnhub-key

# ---- AI MODELLERI (en az biri gerekli) ----

# Varsayilan lokal model (ollama ile yuklediginiz model)
AI_MODEL=qwen3:14b

# ---- ISTEGE BAGLI ----

# Inngest (arka plan islemleri — https://inngest.com)
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# E-posta bildirimleri (Gmail SMTP)
NODEMAILER_EMAIL=
NODEMAILER_PASSWORD=

# Google Gemini (gunluk haber ozetleri)
GEMINI_API_KEY=

# Groq Cloud (hizli bulut AI — https://console.groq.com/keys)
GROQ_API_KEY=

# OpenRouter (yedek bulut AI — https://openrouter.ai/keys)
OPENROUTER_API_KEY=
```

> **Onemli:** `.env` dosyasi `.gitignore` tarafindan dislanir. Asla GitHub'a push'lanmaz.

---

## 5. Inngest (Arka Plan Islemleri)

Inngest, arka plan optimizasyon islemleri ve e-posta bildirimleri icin kullanilir.

```bash
# Inngest CLI'i yukleyin:
npm install -g inngest-cli

# Gelistirme modunda calistirin (ayri terminal):
npx inngest dev
```

Bu komut `localhost:8288` adresinde Inngest dashboard'unu baslatir.

> Inngest opsiyoneldir. AI'nin `optimizeParameter` ve `rankIndicators` araclari Inngest olmadan calismaz, ancak temel AI sohbeti calisir.

---

## 6. Uygulamayi Baslatin

```bash
# Gelistirme sunucusu:
npm run dev

# Tarayicida acin:
# http://localhost:3000
```

Ilk calistirmada:
1. `/sign-up` sayfasindan hesap olusturun
2. AI sayfasina gidin (`/ai`)
3. Model secin (varsayilan: Ollama qwen3:14b)
4. Sohbete baslayin

---

## 7. Opsiyonel: Cloud AI Modelleri

Lokal Ollama haricinde su cloud saglayicilar kullanilabilir:

| Saglayici | Hiz | Maliyet | API Key |
|-----------|-----|---------|---------|
| **Ollama** (lokal) | Yavas (~30-60sn) | Ucretsiz | Gerekmez |
| **Groq** | Cok hizli (~1sn) | Ucretsiz tier | https://console.groq.com/keys |
| **OpenRouter** | Hizli (~3-5sn) | Ucretsiz tier (paylasimli) | https://openrouter.ai/keys |

Groq veya OpenRouter kullanmak icin:
1. API key alin
2. `.env` dosyasina ilgili key'i ekleyin (`GROQ_API_KEY` veya `OPENROUTER_API_KEY`)
3. AI sayfasindaki model seciciden cloud modeli secin

---

## Sik Karsilasilan Sorunlar

**Q: "Cannot connect to AI model" hatasi aliyorum**
- Ollama'in calistigindan emin olun: `ollama list`
- Modelin yuklu oldugunu kontrol edin: `ollama pull qwen3:14b`
- Ollama portunun dogru oldugunu kontrol edin: varsayilan `11434`

**Q: MongoDB baglanti hatasi**
- Atlas kullaniyorsaniz IP whitelist'e `0.0.0.0/0` eklediginizden emin olun
- Lokal MongoDB kullaniyorsaniz servisin calistigini kontrol edin

**Q: Inngest islemleri calismiyor**
- `npx inngest dev` komutunun ayri bir terminalde calistigindan emin olun
- `.env` dosyasinda `INNGEST_EVENT_KEY` tanimli olmali

**Q: Finnhub rate limit hatasi**
- Ucretsiz Finnhub tier: dakikada 60 istek
- Bu limit asilirsa bir sure bekleyip tekrar deneyin

**Q: Ollama cok yavas**
- Daha kucuk bir model deneyin: `qwen3:3b`
- Veya Groq'un ucretsiz tier'ini kullanin (~1sn yanit)
