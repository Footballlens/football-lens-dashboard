// api/auth/login.js — Send magic link to verified email
// POST { email }  →  sends magic link if email is in ALLOWED_EMAILS

import crypto from "crypto";

const RESEND_API_KEY   = process.env.RESEND_API_KEY;
const JWT_SECRET       = process.env.JWT_SECRET;           // random 64-char string you generate once
const ALLOWED_EMAILS   = (process.env.ALLOWED_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
const DASHBOARD_URL    = process.env.DASHBOARD_URL || "https://football-lens-dashboard.vercel.app";
const TOKEN_EXPIRY_MIN = 10;

// Simple token store (Vercel serverless — use KV in production for multi-instance)
// For single-user dashboard this in-memory approach works per cold-start
// A better approach: store token hash in Sheet Brain (see below)
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

async function storeToken(email, token, expiresAt) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "storeAuthToken",
        email,
        tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
        expiresAt,
      }),
    });
  } catch { /* non-critical — token in URL is the source of truth */ }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email required" });

  const normalizedEmail = email.trim().toLowerCase();

  // Only allow pre-approved emails
  if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
    // Return same message to prevent email enumeration
    return res.status(200).json({ message: "If this email is registered, a login link has been sent." });
  }

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: "Email service not configured — add RESEND_API_KEY to Vercel" });
  }
  if (!JWT_SECRET) {
    return res.status(500).json({ error: "JWT_SECRET not configured" });
  }

  // Generate cryptographically secure token
  const token     = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TOKEN_EXPIRY_MIN * 60 * 1000;

  // Sign payload: email + expiry + hash (simple JWT-like without library)
  const payload   = Buffer.from(JSON.stringify({ email: normalizedEmail, exp: expiresAt })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${token}.${payload}`).digest("hex");
  const magicToken = `${token}.${payload}.${signature}`;

  const magicLink = `${DASHBOARD_URL}?auth=${encodeURIComponent(magicToken)}`;

  // Store token hash for server-side verification
  await storeToken(normalizedEmail, token, expiresAt);

  // Send email via Resend
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from:    "Football Lens <noreply@footballlens.ai>",
      to:      [normalizedEmail],
      subject: "🔭 Your Football Lens Login Link",
      html: `
        <div style="font-family: 'DM Sans', Arial, sans-serif; background:#0b0f18; padding:40px; border-radius:16px; max-width:480px; margin:0 auto;">
          <div style="text-align:center; margin-bottom:28px;">
            <div style="width:56px; height:56px; background:linear-gradient(135deg,#00e676,#00d4ff); border-radius:14px; display:inline-flex; align-items:center; justify-content:center; font-size:28px;">🔭</div>
            <h1 style="color:#e8f0fe; font-size:22px; margin:12px 0 4px; font-weight:800;">Football Lens</h1>
            <p style="color:#7a8fa6; font-size:13px; margin:0;">AI Media Engine</p>
          </div>
          <div style="background:#141c2e; border:1px solid #1e2d45; border-radius:12px; padding:24px; margin-bottom:20px;">
            <p style="color:#e8f0fe; font-size:15px; margin:0 0 16px; font-weight:600;">Your secure login link is ready</p>
            <p style="color:#7a8fa6; font-size:13px; margin:0 0 20px; line-height:1.6;">Click the button below to access your Football Lens dashboard. This link expires in <strong style="color:#f0a500;">${TOKEN_EXPIRY_MIN} minutes</strong> and can only be used once.</p>
            <a href="${magicLink}" style="display:block; background:linear-gradient(135deg,#00e676,#00d4ff); color:#000; text-decoration:none; text-align:center; padding:14px; border-radius:10px; font-weight:800; font-size:15px;">🚀 Login to Dashboard</a>
          </div>
          <p style="color:#3a4f66; font-size:12px; text-align:center; margin:0;">If you didn't request this, ignore this email. Link expires at ${new Date(expiresAt).toLocaleTimeString()}.</p>
        </div>
      `,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.json();
    console.error("Resend error:", err);
    return res.status(500).json({ error: "Failed to send email — check Resend configuration" });
  }

  return res.status(200).json({
    message: "If this email is registered, a login link has been sent.",
    // In dev mode only, return the link for testing
    ...(process.env.NODE_ENV === "development" ? { devLink: magicLink } : {}),
  });
}
