// POST /api/match: CV metni + ilan metni -> Claude ile gerekçeli uyum analizi.
// Anahtar Vercel ortam değişkeninde (ANTHROPIC_API_KEY); veri saklanmaz.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MAX_CHARS = 12000;
const hits = new Map(); // ip -> [zaman damgaları]; örnek başına kaba hız sınırı

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "summary", "strengths", "gaps", "suggestions"],
  properties: {
    score: { type: "integer", description: "0-100 uyum puanı" },
    summary: { type: "string", description: "Tek cümlelik genel değerlendirme" },
    strengths: { type: "array", items: { type: "string" }, description: "İlanla örtüşen somut noktalar" },
    gaps: { type: "array", items: { type: "string" }, description: "İlanın isteyip CV'de görünmeyenler" },
    suggestions: { type: "array", items: { type: "string" }, description: "CV'yi bu ilana göre güçlendirecek dürüst öneriler" }
  }
};

const SYSTEM = `Sen Compalist'in aday-ilan eşleştirme motorusun. Bir CV ile bir iş ilanını karşılaştırıp gerekçeli bir uyum analizi yaparsın.
Kurallar:
- Puanı (0-100) beceriler, deneyim süresi ve türü, eğitim, dil, sertifika ve ilandaki zorunlu/tercih edilen kriterlere göre ver. Zorunlu kriter eksikse puanı belirgin düşür.
- Her güçlü yön ve eksik, CV'den veya ilandan somut bir dayanağa bağlı olsun. CV'de olmayan bir şeyi varmış gibi yazma.
- Öneriler adayı abartmaya veya uydurmaya yönlendirmesin; var olan deneyimi daha iyi anlatmaya ya da eksiği kapatmaya yönelik olsun.
- Yaş, cinsiyet, medeni durum, köken, din, engellilik gibi korunan özellikleri değerlendirmeye katma.
- En fazla 5 güçlü yön, 5 eksik, 4 öneri. Kısa ve net cümleler.
- Yanıt dili: kullanıcının istediği dil.`;

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 10;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method" });
  }
  const { cv, job, lang } = req.body || {};
  if (typeof cv !== "string" || typeof job !== "string" || cv.trim().length < 80 || job.trim().length < 80) {
    return res.status(400).json({ error: "short" });
  }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (limited(ip)) return res.status(429).json({ error: "rate" });

  const params = {
    model: "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `Yanıt dili: ${lang === "en" ? "English" : "Türkçe"}\n\n<cv>\n${cv.slice(0, MAX_CHARS)}\n</cv>\n\n<ilan>\n${job.slice(0, MAX_CHARS)}\n</ilan>`
    }]
  };

  try {
    let response;
    try {
      // Reddedilen istek sunucu tarafında uygun modele yönlendirilir.
      response = await client.beta.messages.create({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    } catch (err) {
      if (!(err instanceof Anthropic.BadRequestError)) throw err;
      response = await client.messages.create(params);
    }
    if (response.stop_reason === "refusal") return res.status(422).json({ error: "refusal" });
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const result = JSON.parse(text);
    result.score = Math.max(0, Math.min(100, Math.round(result.score)));
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "rate" });
    console.error(err);
    return res.status(502).json({ error: "upstream" });
  }
}
