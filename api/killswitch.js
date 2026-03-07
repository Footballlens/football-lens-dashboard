// api/killswitch.js — Emergency stop for X posting
// GET           →  { active: bool, pausedAt, pausedBy, reason }
// POST { action: "pause"|"resume", reason? }  →  updates state
//
// State is stored in Google Sheet "Setup Guide" tab, cell B2
// api/post.js checks this before every tweet

import crypto from "crypto";

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const JWT_SECRET      = process.env.JWT_SECRET;

// ── Verify session token ───────────────────────────────────────────────────
function verifySession(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(payload).digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() > decoded.exp) return null;
    return decoded;
  } catch { return null; }
}

// ── Read kill switch state from Sheet ────────────────────────────────────────
async function getKillSwitchState() {
  if (!APPS_SCRIPT_URL) return { active: true }; // default: posting active
  try {
    const url  = `${APPS_SCRIPT_URL}?action=read&sheet=Setup%20Guide&range=B2:F2`;
    const res  = await fetch(url);
    const data = await res.json();
    const row  = data.data?.[0] || [];
    // B2=status("ACTIVE"|"PAUSED"), C2=pausedAt, D2=pausedBy, E2=reason, F2=resumedAt
    return {
      active:    (row[0] || "ACTIVE") === "ACTIVE",
      status:    row[0] || "ACTIVE",
      pausedAt:  row[1] || null,
      pausedBy:  row[2] || null,
      reason:    row[3] || null,
      resumedAt: row[4] || null,
    };
  } catch { return { active: true, status: "ACTIVE" }; }
}

// ── Write kill switch state to Sheet ─────────────────────────────────────────
async function setKillSwitchState(action, email, reason) {
  if (!APPS_SCRIPT_URL) return;
  const now    = new Date().toISOString();
  const status = action === "pause" ? "PAUSED" : "ACTIVE";
  const updates = [
    { sheet: "Setup Guide", rowIndex: 2, colIndex: 2, value: status },              // B2
    { sheet: "Setup Guide", rowIndex: 2, colIndex: 3, value: action==="pause" ? now : "" },  // C2
    { sheet: "Setup Guide", rowIndex: 2, colIndex: 4, value: email || "Dashboard" }, // D2
    { sheet: "Setup Guide", rowIndex: 2, colIndex: 5, value: reason || "" },         // E2
    { sheet: "Setup Guide", rowIndex: 2, colIndex: 6, value: action==="resume" ? now : "" }, // F2
  ];
  await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "batchUpdate", updates }),
  });

  // Also log to AI Dashboard for audit trail
  await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      action: "append",
      sheet: "AI Dashboard",
      row: [
        new Date().toLocaleDateString(),
        new Date().toLocaleTimeString(),
        action === "pause" ? "KILL_SWITCH_ACTIVATED" : "KILL_SWITCH_DEACTIVATED",
        0, 0, 0,
        `${action.toUpperCase()} by ${email || "Dashboard"}: ${reason || "No reason given"}`,
      ],
    }),
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // GET — check current state (no auth required — post.js calls this)
  if (req.method === "GET") {
    const state = await getKillSwitchState();
    return res.status(200).json(state);
  }

  // POST — change state (requires auth)
  if (req.method === "POST") {
    const session = verifySession(req.headers.authorization);
    // Allow unauthenticated PAUSE for emergency (but require auth to resume)
    const { action, reason } = req.body || {};
    if (!["pause", "resume"].includes(action)) {
      return res.status(400).json({ error: "action must be 'pause' or 'resume'" });
    }
    if (action === "resume" && !session) {
      return res.status(401).json({ error: "Authentication required to resume posting" });
    }

    await setKillSwitchState(action, session?.email || "Emergency Stop", reason);
    return res.status(200).json({
      success: true,
      active: action === "resume",
      message: action === "pause" ? "🔴 Posting PAUSED — no tweets will be sent" : "🟢 Posting RESUMED — system active",
    });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
