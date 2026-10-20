# Compalist

compalist.com tanıtım sayfası ve ücretsiz ATS uyumlu CV oluşturucu. Statik site; Vercel ile yayınlanır.

- `index.html`: tanıtım sayfası (TR/EN)
- `cv.html`: CV oluşturucu (`/cv`), tamamen tarayıcıda çalışır, veri sunucuya gönderilmez
- `vercel.json`: temiz URLler (`/cv`)
- `api/match.js`: Vercel fonksiyonu (`POST /api/match`). CV ve ilan metnini Claude API'ye gönderip gerekçeli uyum puanı döndürür. Vercel'de `ANTHROPIC_API_KEY` ortam değişkeni gerekir; metinler saklanmaz.
