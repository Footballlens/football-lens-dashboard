// api/post.js — Post to X/Twitter for both EN and AR accounts
const crypto = require("crypto");

// EN Account — @Football_Lens91
const EN = {
  apiKey:            process.env.X_EN_API_KEY,
  apiSecret:         process.env.X_EN_API_SECRET,
  accessToken:       process.env.X_EN_ACCESS_TOKEN,
  accessSecret:      process.env.X_EN_ACCESS_SECRET,
};

// AR Account — @FootballLens91
const AR = {
  apiKey:            process.env.X_AR_API_KEY,
  apiSecret:         process.env.X_AR_API_SECRET,
  accessToken:       process.env.X_AR_ACCESS_TOKEN,
  accessSecret:      process.env.X_AR_ACCESS_SECRET,
};

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;

// ── OAuth 1.0a signing ────────────────────────────────────────────────────────
function oauthSign(method, url, params, creds) {
  const oauthParams = {
    oauth_consumer_key:     creds.apiKey,
    oauth_nonce:            crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            creds.accessToken,
    oauth_version:          "1.0",
  };

  const allParams = { ...params, ...oauthParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join("&");

  const signingKey = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  oauthParams.oauth_signature = signature;

  const authHeader = "OAuth " + Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(", ");

  return authHeader;
}

// ── Post a single tweet ───────────────────────────────────────────────────────
async function postTweet(text, creds) {
  const url  = "https://api.twitter.com/2/tweets";
  const body = JSON.stringify({ text });
  const auth = oauthSign("POST", url, {}, creds);

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization":  auth,
      "Content-Type":   "application/json",
      "User-Agent":     "FootballLensBot/1.0",
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || data?.title || JSON.stringify(data));
  return data.data; // { id, text }
}

// ── Update sheet status ───────────────────────────────────────────────────────
async function updateSheet(rowIndex, tweetIdEN, tweetIdAR) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action:    "updateStatus",
        rowIndex,
        status:    "Posted",
        postedTime: new Date().toISOString(),
        tweetIdEN,
        tweetIdAR,
      }),
    });
  } catch (e) {
    console.error("Sheet update error:", e.message);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  // ── Check kill switch ───────────────────────────────────────────────────────
  try {
    const ksRes  = await fetch(`${process.env.DASHBOARD_URL}/api/killswitch`);
    const ksData = await ksRes.json();
    if (ksData.status === "PAUSED") {
      return res.status(200).json({ skipped: true, reason: "Kill switch is PAUSED" });
    }
  } catch (e) {
    console.warn("Kill switch check failed:", e.message);
  }

  const { textEN, textAR, rowIndex, account } = req.body || {};

  if (!textEN && !textAR) {
    return res.status(400).json({ error: "textEN or textAR is required" });
  }

  const results = {};
  const errors  = {};

  // ── Post EN tweet ───────────────────────────────────────────────────────────
  if (textEN && (account === "EN" || account === "BOTH" || !account)) {
    if (!EN.apiKey) {
      errors.en = "X_EN_API_KEY not configured";
    } else {
      try {
        const tweet = await postTweet(textEN, EN);
        results.en  = { id: tweet.id, url: `https://x.com/Football_Lens91/status/${tweet.id}` };
      } catch (e) {
        errors.en = e.message;
      }
    }
  }

  // ── Post AR tweet ───────────────────────────────────────────────────────────
  if (textAR && (account === "AR" || account === "BOTH" || !account)) {
    if (!AR.apiKey) {
      errors.ar = "X_AR_API_KEY not configured";
    } else {
      try {
        const tweet = await postTweet(textAR, AR);
        results.ar  = { id: tweet.id, url: `https://x.com/FootballLens91/status/${tweet.id}` };
      } catch (e) {
        errors.ar = e.message;
      }
    }
  }

  // ── Update Google Sheet ─────────────────────────────────────────────────────
  if ((results.en || results.ar) && rowIndex) {
    await updateSheet(rowIndex, results.en?.id, results.ar?.id);
  }

  const success = Object.keys(results).length > 0;

  return res.status(success ? 200 : 500).json({
    success,
    results,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  });
};
