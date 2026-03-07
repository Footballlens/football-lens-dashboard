// api/image.js — Football Lens Visual Generator
// Generates post images via DALL-E 3 (OpenAI)
// POST { prompt, style? }  →  { imageUrl, revisedPrompt }

export const config = { maxDuration: 30 };

const OPENAI_KEY = process.env.OPENAI_API_KEY;

// Football-specific style prefix for consistent brand look
const BRAND_STYLE = "Professional football social media graphic, dark cinematic background, dramatic stadium lighting, bold typography space, high contrast, broadcast quality, 16:9 aspect ratio. Style: ";

const STYLE_PRESETS = {
  breaking:  "urgent red and white color scheme, breaking news lower-third graphic",
  transfer:  "gold and dark blue transfer announcement style, player silhouette",
  match:     "stadium atmosphere, green pitch aerial view, match day energy",
  history:   "vintage sepia-toned with modern overlay, archival aesthetic",
  viral:     "bright vibrant colors, meme-friendly composition, bold text space",
  default:   "premium dark football aesthetic, green and white accent colors",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!OPENAI_KEY) {
    return res.status(500).json({
      error: "OpenAI API key not configured",
      hint: "Add OPENAI_API_KEY to Vercel environment variables",
    });
  }

  const { prompt, style = "default", tone = "" } = req.body;
  if (!prompt) return res.status(400).json({ error: "prompt is required" });

  // Pick style preset based on tone/style
  const toneKey = tone.toLowerCase().includes("breaking") ? "breaking"
                : tone.toLowerCase().includes("transfer") ? "transfer"
                : tone.toLowerCase().includes("histor")   ? "history"
                : tone.toLowerCase().includes("funny")    ? "viral"
                : style in STYLE_PRESETS ? style : "default";

  const fullPrompt = BRAND_STYLE + STYLE_PRESETS[toneKey] + ". " + prompt
    + " NO text, letters, or words in the image. Football/soccer themed.";

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: fullPrompt,
        n: 1,
        size: "1792x1024",  // closest to 1200x675 ratio (16:9)
        quality: "standard",
        response_format: "url",
      }),
    });

    const data = await response.json();

    if (data.error) {
      // Fallback: try with simplified prompt if too complex
      if (data.error.code === "content_policy_violation") {
        const safePrompt = BRAND_STYLE + STYLE_PRESETS.default + ". Professional football stadium scene, no text.";
        const fallback = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_KEY}` },
          body: JSON.stringify({ model: "dall-e-3", prompt: safePrompt, n: 1, size: "1792x1024", quality: "standard", response_format: "url" }),
        });
        const fbData = await fallback.json();
        if (fbData.data?.[0]?.url) {
          return res.status(200).json({ imageUrl: fbData.data[0].url, revisedPrompt: fbData.data[0].revised_prompt, fallback: true });
        }
      }
      throw new Error(data.error.message);
    }

    return res.status(200).json({
      imageUrl: data.data[0].url,
      revisedPrompt: data.data[0].revised_prompt,
      style: toneKey,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
