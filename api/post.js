// api/post.js — Football Lens X Publisher v3
// Legal safeguards: daily cap (8/day), 45-min spacing,
// hard attribution footer, permanent delete support

const crypto = require("crypto");

const EN = {
  apiKey:      process.env.X_EN_API_KEY,
  apiSecret:   process.env.X_EN_API_SECRET,
  accessToken: process.env.X_EN_ACCESS_TOKEN,
  accessSecret:process.env.X_EN_ACCESS_SECRET,
};
const AR = {
  apiKey:      process.env.X_AR_API_KEY,
  apiSecret:   process.env.X_AR_API_SECRET,
  accessToken: process.env.X_AR_ACCESS_TOKEN,
  accessSecret:process.env.X_AR_ACCESS_SECRET,
};

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const DASHBOARD_URL   = process.env.DASHBOARD_URL;

const MAX_POSTS_PER_DAY   = 8;
const MIN_SPACING_MINUTES = 45;

// ── OAUTH 1.0a ────────────────────────────────────────────────────────────────
function oauthSign(method, url, params, creds) {
  const op = {
    oauth_consumer_key:     creds.apiKey,
    oauth_nonce:            crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp:        Math.floor(Date.now()/1000).toString(),
    oauth_token:            creds.accessToken,
    oauth_version:          "1.0",
  };
  const all    = {...params,...op};
  const sorted = Object.keys(all).sort().map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(all[k])}`).join("&");
  const base   = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(sorted)].join("&");
  const key    = `${encodeURIComponent(creds.apiSecret)}&${encodeURIComponent(creds.accessSecret)}`;
  op.oauth_signature = crypto.createHmac("sha1",key).update(base).digest("base64");
  return "OAuth "+Object.keys(op).sort().map(k=>`${encodeURIComponent(k)}="${encodeURIComponent(op[k])}"`).join(", ");
}

// ── DAILY POST COUNT ──────────────────────────────────────────────────────────
async function getDailyPostCount() {
  if (!APPS_SCRIPT_URL) return { count:0, lastPostedAt:null };
  try {
    const today = new Date().toLocaleDateString("en-GB");
    const res   = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=Posts%20Log&range=A1:M500`);
    const data  = await res.json();
    const rows  = (data.data||[]).filter(r=>r[0]===today&&(r[11]||"").toLowerCase()==="posted");
    let last = null;
    rows.forEach(r => { const d = r[12]?new Date(r[12]):null; if (d&&(!last||d>last)) last=d; });
    return { count:rows.length, lastPostedAt:last };
  } catch { return { count:0, lastPostedAt:null }; }
}

// ── HARD ATTRIBUTION FOOTER ───────────────────────────────────────────────────
function enforceAttribution(text, sourceName) {
  if (!text) return text;
  if (text.includes("via ")||text.includes("📌")||text.includes("Source:")) return text;
  const attr = sourceName ? ` 📌 via ${sourceName}` : "";
  const combined = text+attr;
  if (combined.length>280) return text.slice(0,280-attr.length-1)+"…"+attr;
  return combined;
}

// ── POST TWEET ────────────────────────────────────────────────────────────────
async function postTweet(text, creds) {
  const url  = "https://api.twitter.com/2/tweets";
  const body = JSON.stringify({ text });
  const auth = oauthSign("POST", url, {}, creds);
  const res  = await fetch(url, {
    method:"POST",
    headers:{"Authorization":auth,"Content-Type":"application/json","User-Agent":"FootballLensBot/3.0"},
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail||data?.title||JSON.stringify(data));
  return data.data;
}

// ── UPDATE SHEET ──────────────────────────────────────────────────────────────
async function updateSheet(rowIndex, tweetIdEN, tweetIdAR) {
  if (!APPS_SCRIPT_URL||!rowIndex) return;
  try {
    await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"updateStatus", rowIndex, status:"Posted", postedTime:new Date().toISOString(), tweetIdEN, tweetIdAR }),
    });
  } catch(e) { console.error("Sheet update error:", e.message); }
}

async function deleteFromSheet(rowIndex) {
  if (!APPS_SCRIPT_URL||!rowIndex) return;
  try {
    await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"updateStatus", rowIndex, status:"Deleted", postedTime:"" }),
    });
  } catch {}
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if (req.method==="OPTIONS") return res.status(200).end();
  if (req.method!=="POST")    return res.status(405).json({ error:"Method not allowed" });

  const { textEN, textAR, rowIndex, account, sourceName, action } = req.body||{};

  // Delete action
  if (action==="delete"&&rowIndex) {
    await deleteFromSheet(rowIndex);
    return res.status(200).json({ success:true, deleted:true });
  }

  // Kill switch
  try {
    const ks = await fetch(`${DASHBOARD_URL}/api/killswitch`).then(r=>r.json());
    if (ks.status==="PAUSED") return res.status(200).json({ skipped:true, reason:"Kill switch PAUSED" });
  } catch {}

  if (!textEN&&!textAR) return res.status(400).json({ error:"textEN or textAR required" });

  // Daily cap + spacing
  const { count, lastPostedAt } = await getDailyPostCount();
  if (count>=MAX_POSTS_PER_DAY) {
    return res.status(200).json({ skipped:true, reason:`Daily cap reached (${count}/${MAX_POSTS_PER_DAY})`, dailyCount:count });
  }
  if (lastPostedAt) {
    const mins = (Date.now()-lastPostedAt.getTime())/60000;
    if (mins<MIN_SPACING_MINUTES) {
      return res.status(200).json({ skipped:true, reason:`Too soon — wait ${Math.ceil(MIN_SPACING_MINUTES-mins)} min`, nextAllowedIn:Math.ceil(MIN_SPACING_MINUTES-mins) });
    }
  }

  // Hard attribution
  const finalEN = enforceAttribution(textEN, sourceName||"Football Lens");
  const finalAR = textAR; // AR posts don't need EN source name

  const results = {};
  const errors  = {};

  if (finalEN&&(account==="EN"||account==="BOTH"||!account)) {
    if (!EN.apiKey) errors.en="X_EN_API_KEY not configured";
    else { try { const t=await postTweet(finalEN,EN); results.en={id:t.id,url:`https://x.com/Football_Lens91/status/${t.id}`}; } catch(e){ errors.en=e.message; } }
  }
  if (finalAR&&(account==="AR"||account==="BOTH"||!account)) {
    if (!AR.apiKey) errors.ar="X_AR_API_KEY not configured";
    else { try { const t=await postTweet(finalAR,AR); results.ar={id:t.id,url:`https://x.com/FootballLens91/status/${t.id}`}; } catch(e){ errors.ar=e.message; } }
  }

  if ((results.en||results.ar)&&rowIndex) await updateSheet(rowIndex,results.en?.id,results.ar?.id);

  const success = Object.keys(results).length>0;
  return res.status(success?200:500).json({
    success, results, dailyCount:count+(success?1:0),
    errors:Object.keys(errors).length>0?errors:undefined,
  });
};
