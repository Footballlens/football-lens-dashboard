// api/auth-verify.js — Verify magic link token
// POST { token }  →  { valid, sessionToken, email, expiresAt }

import crypto from "crypto";

const JWT_SECRET    = process.env.JWT_SECRET;
const SESSION_HOURS = 24;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!JWT_SECRET) {
    return res.status(500).json({ valid: false, error: "JWT_SECRET not configured" });
  }

  const { token } = req.body || {};
  if (!token) return res.status(400).json({ valid: false, error: "Token is required" });

  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Malformed token");

    const [rawToken, payload, signature] = parts;

    // Verify HMAC signature
    const expectedSig = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${rawToken}.${payload}`)
      .digest("hex");

    const sigBuffer      = Buffer.from(signature,     "hex");
    const expectedBuffer = Buffer.from(expectedSig,   "hex");

    if (sigBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      throw new Error("Invalid token signature");
    }

    // Decode and check expiry
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() > decoded.exp) {
      return res.status(401).json({ valid: false, error: "Link has expired — please request a new one" });
    }

    // Issue 24h session token
    const sessionExp     = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
    const sessionPayload = Buffer.from(JSON.stringify({
      email: decoded.email, exp: sessionExp, type: "session"
    })).toString("base64url");
    const sessionSig   = crypto.createHmac("sha256", JWT_SECRET).update(sessionPayload).digest("hex");
    const sessionToken = `${sessionPayload}.${sessionSig}`;

    return res.status(200).json({
      valid: true,
      sessionToken,
      email: decoded.email,
      expiresAt: sessionExp,
    });

  } catch (e) {
    return res.status(401).json({ valid: false, error: e.message });
  }
}
