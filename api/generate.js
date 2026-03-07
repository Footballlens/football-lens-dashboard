// api/generate.js — Anthropic proxy + Auth endpoints
const crypto = require("crypto");

const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const RESEND_KEY     = process.env.RESEND_API_KEY;
const JWT_SECRET     = process.env.JWT_SECRET;
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
const DASHBOARD_URL  = process.env.DASHBOARD_URL || "https://football-lens-dashboard.vercel.app";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Action");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ── BODY PARSER (Vercel sometimes passes raw string) ──────────────────────
  if (typeof req.body === "string") {
    try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
  }
  if (!req.body || typeof req.body !== "object") req.body = {};

  const action = req.headers["x-action"] || "generate";

  // ── AUTH LOGIN ────────────────────────────────────────────────────────────
  if (action === "auth-login") {
    if (!JWT_SECRET)    return res.status(500).json({ error: "JWT_SECRET not configured" });
    if (!RESEND_KEY)    return res.status(500).json({ error: "RESEND_API_KEY not configured" });
    if (!ALLOWED_EMAILS.length) return res.status(500).json({ error: "ALLOWED_EMAILS not configured" });

    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.trim().toLowerCase();
    if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
      return res.status(200).json({ message: "If this email is registered, a login link has been sent." });
    }

    const token      = crypto.randomBytes(32).toString("hex");
    const expiresAt  = Date.now() + 10 * 60 * 1000;
    const payload    = Buffer.from(JSON.stringify({ email: normalizedEmail, exp: expiresAt })).toString("base64");
    const signature  = crypto.createHmac("sha256", JWT_SECRET).update(`${token}.${payload}`).digest("hex");
    const magicToken = `${token}.${payload}.${signature}`;
    const magicLink  = `${DASHBOARD_URL}?auth=${encodeURIComponent(magicToken)}`;

    try {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: "Football Lens <onboarding@resend.dev>",
          to: [normalizedEmail],
          subject: "🔭 Your Football Lens Login Link",
          html: `<div style="font-family:Arial,sans-serif;padding:40px;max-width:480px;margin:0 auto;background:#0b0f18;border-radius:16px;">
            <div style="text-align:center;margin-bottom:24px;"><div style="font-size:40px;">🔭</div>
            <h1 style="color:#e8f0fe;font-size:22px;margin:8px 0 4px;">Football Lens</h1>
            <p style="color:#7a8fa6;font-size:13px;margin:0;">AI Media Engine</p></div>
            <div style="background:#141c2e;border:1px solid #1e2d45;border-radius:12px;padding:24px;margin-bottom:16px;">
            <p style="color:#e8f0fe;font-size:14px;margin:0 0 16px;">Click below to login. Link expires in <strong style="color:#f0a500;">10 minutes</strong>.</p>
            <a href="${magicLink}" style="display:block;background:#00e676;color:#000;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:800;font-size:15px;">🚀 Login to Dashboard</a></div>
            <p style="color:#3a4f66;font-size:12px;text-align:center;">If you didn't request this, ignore this email.</p></div>`,
        }),
      });
      const resendData = await emailRes.json();
      if (!emailRes.ok) return res.status(500).json({ error: `Email failed: ${resendData.message || "Resend error"}` });
      return res.status(200).json({ message: "If this email is registered, a login link has been sent." });
    } catch (e) {
      return res.status(500).json({ error: `Server error: ${e.message}` });
    }
  }

  // ── AUTH VERIFY ───────────────────────────────────────────────────────────
  if (action === "auth-verify") {
    if (!JWT_SECRET) return res.status(500).json({ valid: false, error: "JWT_SECRET not configured" });

    const { token } = req.body || {};
    if (!token) return res.status(400).json({ valid: false, error: "Token is required" });

    try {
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("Malformed token");
      const [rawToken, payload, signature] = parts;
      const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${rawToken}.${payload}`).digest("hex");
      if (signature !== expectedSig) throw new Error("Invalid token signature");
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      if (Date.now() > decoded.exp) {
        return res.status(401).json({ valid: false, error: "Link has expired — please request a new one" });
      }
      const sessionExp     = Date.now() + 24 * 60 * 60 * 1000;
      const sessionPayload = Buffer.from(JSON.stringify({ email: decoded.email, exp: sessionExp })).toString("base64");
      const sessionSig     = crypto.createHmac("sha256", JWT_SECRET).update(sessionPayload).digest("hex");
      const sessionToken   = `${sessionPayload}.${sessionSig}`;
      return res.status(200).json({ valid: true, sessionToken, email: decoded.email, expiresAt: sessionExp });
    } catch (e) {
      return res.status(401).json({ valid: false, error: e.message });
    }
  }

  // ── KILL SWITCH GET STATE ─────────────────────────────────────────────────
  if (action === "killswitch-get") {
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    if (!APPS_SCRIPT_URL) return res.status(200).json({ active: true, status: "ACTIVE" });
    try {
      const url  = `${APPS_SCRIPT_URL}?action=read&sheet=Setup%20Guide&range=B2:F2`;
      const r    = await fetch(url);
      const data = await r.json();
      const row  = data.data?.[0] || [];
      return res.status(200).json({ active: (row[0] || "ACTIVE") === "ACTIVE", status: row[0] || "ACTIVE", pausedAt: row[1] || null, reason: row[3] || null });
    } catch { return res.status(200).json({ active: true, status: "ACTIVE" }); }
  }

  // ── KILL SWITCH SET STATE ─────────────────────────────────────────────────
  if (action === "killswitch-set") {
    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const { killAction, reason, email } = req.body || {};
    if (!APPS_SCRIPT_URL) return res.status(500).json({ error: "APPS_SCRIPT_URL not configured" });
    const now    = new Date().toISOString();
    const status = killAction === "pause" ? "PAUSED" : "ACTIVE";
    const updates = [
      { sheet: "Setup Guide", rowIndex: 2, colIndex: 2, value: status },
      { sheet: "Setup Guide", rowIndex: 2, colIndex: 3, value: killAction === "pause" ? now : "" },
      { sheet: "Setup Guide", rowIndex: 2, colIndex: 4, value: email || "Dashboard" },
      { sheet: "Setup Guide", rowIndex: 2, colIndex: 5, value: reason || "" },
    ];
    try {
      await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "batchUpdate", updates }) });
      return res.status(200).json({ success: true, active: killAction === "resume", message: killAction === "pause" ? "🔴 Posting PAUSED" : "🟢 Posting RESUMED" });
    } catch (e) { return res.status(500).json({ error: e.message }); }
  }

  // ── AI GENERATE (default) ─────────────────────────────────────────────────
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "API key not configured in Vercel" });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "No prompt provided" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
