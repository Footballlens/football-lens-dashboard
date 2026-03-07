// api/auth-login.js
const crypto = require("crypto");

const RESEND_API_KEY   = process.env.RESEND_API_KEY;
const JWT_SECRET       = process.env.JWT_SECRET;
const ALLOWED_EMAILS   = (process.env.ALLOWED_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const DASHBOARD_URL    = process.env.DASHBOARD_URL || "https://football-lens-dashboard.vercel.app";
const TOKEN_EXPIRY_MIN = 10;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!JWT_SECRET)     return res.status(500).json({ error: "JWT_SECRET not configured" });
  if (!RESEND_API_KEY) return res.status(500).json({ error: "RESEND_API_KEY not configured" });
  if (!ALLOWED_EMAILS.length) return res.status(500).json({ error: "ALLOWED_EMAILS not configured" });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email is required" });

  const normalizedEmail = email.trim().toLowerCase();

  if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
    return res.status(200).json({ message: "If this email is registered, a login link has been sent." });
  }

  const token      = crypto.randomBytes(32).toString("hex");
  const expiresAt  = Date.now() + TOKEN_EXPIRY_MIN * 60 * 1000;
  const payload    = Buffer.from(JSON.stringify({ email: normalizedEmail, exp: expiresAt })).toString("base64");
  const signature  = crypto.createHmac("sha256", JWT_SECRET).update(`${token}.${payload}`).digest("hex");
  const magicToken = `${token}.${payload}.${signature}`;
  const magicLink  = `${DASHBOARD_URL}?auth=${encodeURIComponent(magicToken)}`;

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: "Football Lens <onboarding@resend.dev>",
        to: [normalizedEmail],
        subject: "🔭 Your Football Lens Login Link",
        html: `<div style="font-family:Arial,sans-serif;padding:40px;max-width:480px;margin:0 auto;background:#0b0f18;border-radius:16px;">
          <div style="text-align:center;margin-bottom:24px;"><div style="font-size:40px;">🔭</div>
          <h1 style="color:#e8f0fe;font-size:22px;margin:8px 0 4px;">Football Lens</h1>
          <p style="color:#7a8fa6;font-size:13px;margin:0;">AI Media Engine</p></div>
          <div style="background:#141c2e;border:1px solid #1e2d45;border-radius:12px;padding:24px;margin-bottom:16px;">
          <p style="color:#e8f0fe;font-size:14px;margin:0 0 16px;">Click below to login. Link expires in <strong style="color:#f0a500;">${TOKEN_EXPIRY_MIN} minutes</strong>.</p>
          <a href="${magicLink}" style="display:block;background:#00e676;color:#000;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:800;font-size:15px;">🚀 Login to Dashboard</a></div>
          <p style="color:#3a4f66;font-size:12px;text-align:center;">If you didn't request this, ignore this email.</p></div>`,
      }),
    });

    const resendData = await emailRes.json();
    if (!emailRes.ok) {
      return res.status(500).json({ error: `Email failed: ${resendData.message || "Resend error"}` });
    }
    return res.status(200).json({ message: "If this email is registered, a login link has been sent." });
  } catch (e) {
    return res.status(500).json({ error: `Server error: ${e.message}` });
  }
};
