// api/auth-login.js — Send magic link
// POST { email }

import crypto from "crypto";

const RESEND_API_KEY  = process.env.RESEND_API_KEY;
const JWT_SECRET      = process.env.JWT_SECRET;
const ALLOWED_EMAILS  = (process.env.ALLOWED_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const DASHBOARD_URL   = process.env.DASHBOARD_URL || "https://football-lens-dashboard.vercel.app";
const TOKEN_EXPIRY_MIN = 10;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── Config checks ─────────────────────────────────────────────────────────
  if (!JWT_SECRET) {
    return res.status(500).json({ error: "JWT_SECRET not configured in Vercel environment variables" });
  }
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: "RESEND_API_KEY not configured in Vercel environment variables" });
  }
  if (ALLOWED_EMAILS.length === 0) {
    return res.status(500).json({ error: "ALLOWED_EMAILS not configured in Vercel environment variables" });
  }

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email is required" });

  const normalizedEmail = email.trim().toLowerCase();

  // Same response whether allowed or not — prevents email enumeration
  if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
    return res.status(200).json({ message: "If this email is registered, a login link has been sent." });
  }

  // ── Generate magic token ──────────────────────────────────────────────────
  const token     = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY_MIN * 60 * 1000;
  const payload   = Buffer.from(JSON.stringify({ email: normalizedEmail, exp: expiresAt })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${token}.${payload}`).digest("hex");
  const magicToken = `${token}.${payload}.${signature}`;
  const magicLink  = `${DASHBOARD_URL}?auth=${encodeURIComponent(magicToken)}`;

  // ── Send email via Resend ─────────────────────────────────────────────────
  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Football Lens <onboarding@resend.dev>",
        to: [normalizedEmail],
        subject: "🔭 Your Football Lens Login Link",
        html: `
          <div style="font-family:Arial,sans-serif;background:#0b0f18;padding:40px;border-radius:16px;max-width:480px;margin:0 auto;">
            <div style="text-align:center;margin-bottom:28px;">
              <div style="font-size:40px;margin-bottom:10px;">🔭</div>
              <h1 style="color:#e8f0fe;font-size:22px;margin:0 0 4px;font-weight:800;">Football Lens</h1>
              <p style="color:#7a8fa6;font-size:13px;margin:0;">AI Media Engine</p>
            </div>
            <div style="background:#141c2e;border:1px solid #1e2d45;border-radius:12px;padding:24px;margin-bottom:20px;">
              <p style="color:#e8f0fe;font-size:15px;margin:0 0 12px;font-weight:600;">Your secure login link</p>
              <p style="color:#7a8fa6;font-size:13px;margin:0 0 20px;line-height:1.6;">
                Click below to access your dashboard. This link expires in
                <strong style="color:#f0a500;">${TOKEN_EXPIRY_MIN} minutes</strong>.
              </p>
              <a href="${magicLink}"
                style="display:block;background:#00e676;color:#000;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:800;font-size:15px;">
                🚀 Login to Dashboard
              </a>
            </div>
            <p style="color:#3a4f66;font-size:12px;text-align:center;margin:0;">
              If you didn't request this, ignore this email.
            </p>
          </div>
        `,
      }),
    });

    const resendData = await emailRes.json();

    if (!emailRes.ok) {
      console.error("Resend error:", resendData);
      return res.status(500).json({
        error: `Email sending failed: ${resendData.message || resendData.name || "Unknown Resend error"}`,
      });
    }

    return res.status(200).json({ message: "If this email is registered, a login link has been sent." });

  } catch (e) {
    console.error("Login handler error:", e);
    return res.status(500).json({ error: `Server error: ${e.message}` });
  }
}
