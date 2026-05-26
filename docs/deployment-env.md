# Deployment & Ortam

> **Amaç:** Ortam değişkeni referansı, build/run script'leri, yaygın hatalar ve production deployment değerlendirmeleri.
> **Kapsam:** `.env`, `package.json` script'leri, Next.js konfigürasyonu, üretim riskleri.
> **Ayrıca bakınız:** [[project-overview]], [[rules-critical]]
> **Son güncelleme:** 2026-05-25 (AI model/provider env değişkenleri güncellendi)

---

## Ortam Değişkenleri (`.env`)

Proje kök dizininde bulunur. `.gitignore` deseni `.env*` ile git'ten hariç tutulur.

### Tam Referans

| Değişken | Zorunlu | Amaç | Örnek |
|----------|---------|------|-------|
| `MONGODB_URI` | **Evet** | MongoDB Atlas bağlantı dizesi | `mongodb+srv://user:pass@cluster.mongodb.net/...` |
| `BETTER_AUTH_SECRET` | **Evet** | Better Auth oturum şifreleme anahtarı | Rastgele string |
| `BETTER_BASE_URL` | **Evet** | Auth callback temel URL'i | `http://localhost:3000` (dev) veya production URL |
| `BETTER_AUTH_URL` | Hayır | BETTER_BASE_URL için takma ad | Yukarıdaki ile aynı |
| `GEMINI_API_KEY` | Yalnızca e-posta | AI e-posta özellikleri için Google Gemini API anahtarı | `AIzaSy...` |
| `NODEMAILER_EMAIL` | Yalnızca e-posta | E-posta gönderimi için Gmail adresi | `you@gmail.com` |
| `NODEMAILER_PASSWORD` | Yalnızca e-posta | Gmail Uygulama Şifresi (hesap şifresi değil) | 16 karakterli uygulama şifresi |
| `FINNHUB_API_KEY` | Hisse verisi | Finnhub API anahtarı (**sadece sunucu tarafı**, `NEXT_PUBLIC_` prefix'i YOK) | `d4jf...` |
| `NEXT_PUBLIC_BASE_URL` | Hayır | Uygulama temel URL'i | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | Hayır | OpenRouter HTTP-Referer header'ı için | `http://localhost:3000` |
| `INNGEST_DEV` | Hayır | Inngest development modu (production'da OLMAMALI) | `1` |
| `AI_MODEL` | AI Agent | Kullanılacak Ollama modeli (varsayılan: `qwen3:14b`) | `qwen3:14b` |
| `GROQ_API_KEY` | Opsiyonel | Groq cloud AI provider (Groq modelleri için) | `gsk_...` |
| `OPENROUTER_API_KEY` | Opsiyonel | OpenRouter cloud AI provider (OpenRouter modelleri için) | `sk-or-...` |
| `NODE_ENV` | Hayır | Ortam adı | `development` / `production` |

### AI Provider Konfigürasyonu

Sistem multi-provider destekler. Prefix bazlı model seçimi:

| Prefix | Provider | Gereken Env | Açıklama |
|--------|----------|-------------|----------|
| `ollama:` | Ollama (lokal) | Yok (localhost:11434) | Varsayılan. Qwen 3 14B |
| `groq:` | Groq Cloud | `GROQ_API_KEY` | Hızlı inference, ücretsiz tier |
| `openrouter:` | OpenRouter | `OPENROUTER_API_KEY` | 200+ model erişimi |
| `groq-key:` | Groq (kullanıcı key) | Kullanıcı girer | Kullanıcı kendi API key'ini kullanır |
| `openai-key:` | OpenAI (kullanıcı key) | Kullanıcı girer | Kullanıcı kendi API key'ini kullanır |
| `openrouter-key:` | OpenRouter (kullanıcı key) | Kullanıcı girer | Kullanıcı kendi API key'ini kullanır |

Env key yoksa Ollama'ya otomatik fallback yapılır.

### Eksik Değişken Davranışı

| Eksik | Etki |
|-------|------|
| `MONGODB_URI` | Uygulama hemen çöker: `"MONGODB_URI must be set within .env"` |
| `BETTER_AUTH_SECRET` | Auth başlatma başarısız olur |
| `BETTER_BASE_URL` | Auth yönlendirmeleri bozulabilir |
| `FINNHUB_API_KEY` | Hisse arama boş döner, mumlar sessizce başarısız olur |
| `GEMINI_API_KEY` | Inngest AI adımları başarısız olur; e-postalar fallback metin alır |
| `NODEMAILER_*` | E-posta gönderimi başarısız olur |
| `GROQ_API_KEY` | Groq modelleri çalışmaz, Ollama'ya fallback |
| `OPENROUTER_API_KEY` | OpenRouter modelleri çalışmaz, Ollama'ya fallback |
| `INNGEST_DEV` (production'da ayarlanmamış) | Inngest production modda çalışır (Inngest Cloud'a bağlanır) |

---

## Build & Run Script'leri

| Komut | Ne Yapar |
|--------|---------|
| `npm run dev` | Turbopack dev sunucusunu 3000 portunda başlatır |
| `npm run build` | React Compiler etkinken production build alır |
| `npm run start` | Production sunucusunu başlatır |
| `npm run lint` | ESLint çalıştırır |
| `npm test` | Vitest test suite'ini tek seferlik çalıştırır (41 test) |
| `npm run test:watch` | Vitest watch modu |
| `npx vitest run` | Vitest'i doğrudan çalıştırır |
| `npx vitest` | Vitest UI modu |

---

## Next.js Konfigürasyonu (`next.config.ts`)

```typescript
const nextConfig: NextConfig = {
  reactCompiler: true,  // React 19 Compiler aktif
};
```

---

## TypeScript Konfigürasyonu (`tsconfig.json`)

- `strict: true` — Tam tip kontrolü
- `target: "ES2017"` — Node.js 8+ uyumlu
- `moduleResolution: "bundler"` — Turbopack uyumluluğu için
- `paths: { "@/*": ["./*"] }` — `@/` import'ları proje köküne eşler

---

## Yaygın Hatalar

| Hata | Nedeni | Çözüm |
|------|--------|-------|
| `MONGODB_URI must be set within .env` | `.env` dosyası eksik | `.env` oluşturun |
| Finnhub verisi gelmiyor | API anahtarı eksik | `FINNHUB_API_KEY` değerini `.env`'e ekleyin |
| AI yanıt vermiyor | Ollama çalışmıyor | `ollama run qwen3:14b` ile modeli başlatın |
| AI "Provider returned error" | OpenRouter/Groq key geçersiz | API key'i kontrol edin, Ollama'ya fallback olur |
| `NEXT_REDIRECT` (hata değil) | Auth guard'ı yönlendiriyor | Beklenen davranış — önce giriş yapın |
| `Unable to acquire lock at .next/dev/lock` | Kilit dosyası kaldı | `.next/dev/lock` dosyasını silin |
| `E11000 duplicate key error` (watchlist) | Hisse zaten izleme listesinde | Sessizce yönetilir |
| `ECONNREFUSED` AI hatası | Ollama bağlı değil | `ollama serve` ile Ollama'yı başlatın |

---

## Production Deployment Değerlendirmeleri

### Dağıtım Öncesi Kontrol Listesi
1. `NODE_ENV=production` ayarlayın
2. `BETTER_BASE_URL`'i production domain'e ayarlayın
3. MongoDB Atlas IP beyaz listesini güncelleyin
4. `npm run build` çalıştırın ve sıfır hata olduğunu doğrulayın
5. Tüm zorunlu env değişkenlerinin production ortamında ayarlandığını doğrulayın
6. `INNGEST_DEV` değişkenini production'da **KALDIRIN**
7. Production'da Ollama yerine Groq veya OpenRouter kullanmayı değerlendirin (daha hızlı, ölçeklenebilir)

### Rate Limit Riskleri

- **Finnhub ücretsiz tier:** 60 istek/dk. Production'da birden fazla kullanıcıyla API çağrıları katlanır
- **Yahoo Finance:** Gayriresmi API, SLA yok. Her an bozulabilir
- **Gmail SMTP:** Ücretsiz Gmail'de 500 e-posta/gün, Google Workspace'te 2000/gün
- **Ollama:** Lokal olduğu için rate limit yok, ancak CPU/GPU kaynakları sınırlı
- **Groq:** Ücretsiz tier rate limitli, production'da yetmeyebilir
- **OpenRouter:** Kredi bazlı, bütçe yönetimi gerekir

### Yerleşik İzleme Yok

Uygulamada izleme, hata takibi veya log birleştirme bulunmamaktadır. Production deployment'a şunlar eklenmelidir:
- Hata takibi (Sentry veya benzeri)
- Uptime izleme
- MongoDB Atlas uyarıları
- Inngest fonksiyon başarısızlık bildirimleri
