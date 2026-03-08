// api/cron.js — Autonomous AI Football Media Engine

const ANTHROPIC_URL   = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const TAVILY_KEY      = process.env.TAVILY_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const DASHBOARD_URL   = process.env.DASHBOARD_URL;

// ── RSS SOURCES ───────────────────────────────────────────────────────────────
const RSS_SOURCES = [
  { name:"BBC Sport",  url:"https://feeds.bbci.co.uk/sport/football/rss.xml", cred:95, tier:"MAJOR" },
  { name:"Sky Sports", url:"https://www.skysports.com/rss/12040",              cred:94, tier:"MAJOR" },
  { name:"ESPN FC",    url:"https://www.espn.com/espn/rss/soccer/news",        cred:93, tier:"MAJOR" },
];

// ── FETCH ONE RSS WITH STRICT 5s TIMEOUT ─────────────────────────────────────
async function fetchRSS(source) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(source.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FootballLensBot/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 3) {
      const block = match[1];
      const title = (/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s.exec(block)||[])[1]?.trim().replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");
      const desc  = (/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s.exec(block)||[])[1]?.replace(/<[^>]+>/g,"").trim().slice(0,200);
      const link  = (/<link>(.*?)<\/link>/s.exec(block)||[])[1]?.trim();
      if (title && title.length > 10 && !title.toLowerCase().includes("advertisement")) {
        items.push({ title, desc: desc||"", link: link||"", source: source.name, cred: source.cred, tier: source.tier });
      }
    }
    return items;
  } catch (e) {
    return []; // timeout or network error — skip silently
  }
}

// ── TAVILY SEARCH ─────────────────────────────────────────────────────────────
async function tavilySearch(query) {
  if (!TAVILY_KEY) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: TAVILY_KEY, query, max_results: 3, search_depth: "basic" }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return (data.results || []).map(r => ({
      title: r.title, desc: (r.content||"").slice(0,200),
      link: r.url, source: "Tavily", cred: 85, tier: "MAJOR"
    }));
  } catch { return []; }
}

// ── CLASSIFY ─────────────────────────────────────────────────────────────────
function classifyItem(item) {
  const text = (item.title + " " + item.desc).toLowerCase();
  if (/transfer|sign|deal|contract|join|move|agree|complet|done deal/.test(text))
    return { type:"Transfer News", tone:"Transfer", priority:1 };
  if (/breaking|urgent|official|confirm|announce|sack|resign|injur/.test(text))
    return { type:"Breaking News", tone:"Breaking", priority:1 };
  if (/goal|score|win|loss|draw|result|final|match|live/.test(text))
    return { type:"Match Update", tone:"Excitement", priority:2 };
  return { type:"Football News", tone:"General", priority:2 };
}

// ── AUTO-APPROVE ──────────────────────────────────────────────────────────────
function getApproval(type, tone, cred) {
  const t = (type + tone).toLowerCase();
  if (t.includes("break")) return { status:"Approved", label:"BREAKING — auto-approved" };
  if (t.includes("transfer")) return { status:"Approved", label:"TRANSFER — auto-approved" };
  if (cred >= 95) return { status:"Approved", label:"HIGH CRED — auto-approved" };
  return { status:"Pending", label:null };
}

// ── GENERATE POST ─────────────────────────────────────────────────────────────
async function generatePost(item, cls) {
  const prompt = `You are Football Lens, a bilingual football media brand on X (Twitter).

Real news: "${item.title}"
Details: "${item.desc}"
Source: ${item.source}
Type: ${cls.type} | Tone: ${cls.tone}

Write ONE X post. Rules:
- EN: max 250 chars, emojis, 2 hashtags, tone matches type
- AR: max 250 chars, natural Arabic, same energy
- DO NOT invent facts — only use what is given

Respond ONLY with this exact JSON (no markdown):
{"en":"...","ar":"...","credibility":${item.cred},"visualRecommended":${cls.priority<=2}}`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type":"application/json", "x-api-key":ANTHROPIC_KEY, "anthropic-version":"2023-06-01" },
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:400, messages:[{ role:"user", content:prompt }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  const text = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  const parsed = JSON.parse(text);
  if (!parsed.en || !parsed.ar) throw new Error("Invalid AI response structure");
  return parsed;
}

// ── LOG TO SHEET ──────────────────────────────────────────────────────────────
async function logPost(post, item, cls, approval) {
  if (!APPS_SCRIPT_URL) return null;
  const now = new Date();
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"Posts Log",
        row:[
          now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"),
          cls.type, cls.tone, post.en, post.ar,
          item.source, item.link||"", post.credibility||item.cred,
          post.visualRecommended?"YES":"NO",
          "BOTH", approval.status,"","","","","","","","",
        ]
      }),
    });
    const data = await res.json();
    return data.rowIndex || null;
  } catch { return null; }
}

// ── AUTO POST TO X ────────────────────────────────────────────────────────────
async function autoPost(post, rowIndex) {
  if (!DASHBOARD_URL || !rowIndex) return;
  try {
    await fetch(`${DASHBOARD_URL}/api/post`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ textEN:post.en, textAR:post.ar, rowIndex, account:"BOTH" }),
    });
  } catch {}
}

// ── LOG CRON RUN ──────────────────────────────────────────────────────────────
async function logCronRun(type, generated, autoApproved, pending, note) {
  if (!APPS_SCRIPT_URL) return;
  try {
    const now = new Date();
    await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"AI Dashboard",
        row:[ now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"), type, generated, autoApproved, pending, note ]
      }),
    });
  } catch {}
}

// ── DEDUP ─────────────────────────────────────────────────────────────────────
function hashTitle(text) {
  let h = 0;
  for (const c of (text||"").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,50))
    h = ((h<<5)-h)+c.charCodeAt(0);
  return (h>>>0).toString(36);
}

async function getRecentHashes() {
  if (!APPS_SCRIPT_URL) return new Set();
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=Posts%20Log&range=E5:E50`);
    const data = await res.json();
    return new Set((data.data||[]).map(r => hashTitle(r[0])));
  } catch { return new Set(); }
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!ANTHROPIC_KEY) return res.status(500).json({ error:"ANTHROPIC_API_KEY not set" });

  const results = { postsGenerated:0, autoApproved:0, pendingApproval:0, rssCount:0, tavilyCount:0, errors:[] };

  try {
    // 1. Fetch news — run RSS in parallel with strict timeouts
    const [rssResults, tavilyItems] = await Promise.all([
      Promise.allSettled(RSS_SOURCES.map(fetchRSS)),
      tavilySearch("football news today breaking transfer"),
    ]);

    const rssItems = rssResults.flatMap(r => r.status === "fulfilled" ? r.value : []);
    results.rssCount    = rssItems.length;
    results.tavilyCount = tavilyItems.length;

    const allItems = [...rssItems, ...tavilyItems];

    // 2. Dedup against recent posts
    const recentHashes = await getRecentHashes();
    const seen = new Set();
    const uniqueItems = allItems
      .filter(item => {
        const h = hashTitle(item.title);
        if (seen.has(h) || recentHashes.has(h)) return false;
        seen.add(h);
        return true;
      })
      .map(item => ({ ...item, cls: classifyItem(item) }))
      .sort((a,b) => a.cls.priority - b.cls.priority)
      .slice(0, 3); // max 3 per run to stay within time limit

    results.uniqueCount = uniqueItems.length;

    // 3. Fallback if no real news found
    if (uniqueItems.length === 0) {
      const day = new Date().toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long" });
      uniqueItems.push({
        title: `Football this week — what to watch on ${day}`,
        desc: "Weekend fixtures, talking points and what matters in football right now",
        source: "Football Lens", cred: 78, tier: "EVERGREEN",
        cls: { type:"Football Story", tone:"General", priority:3 }
      });
      results.fallback = true;
    }

    // 4. Generate + log — one at a time to avoid parallel timeout
    for (const item of uniqueItems) {
      try {
        const post     = await generatePost(item, item.cls);
        const approval = getApproval(item.cls.type, item.cls.tone, post.credibility || item.cred);
        const rowIndex = await logPost(post, item, item.cls, approval);

        results.postsGenerated++;
        if (approval.status === "Approved") {
          results.autoApproved++;
          if (rowIndex) await autoPost(post, rowIndex);
        } else {
          results.pendingApproval++;
        }
      } catch (e) {
        results.errors.push(`${item.source}: ${e.message}`);
      }
    }

    const note = `RSS:${results.rssCount} Tavily:${results.tavilyCount} Unique:${results.uniqueCount}${results.fallback?" [fallback]":""}`;
    await logCronRun("news", results.postsGenerated, results.autoApproved, results.pendingApproval, note);

    return res.status(200).json({ success:true, ...results });

  } catch (e) {
    await logCronRun("error", 0, 0, 0, e.message);
    return res.status(500).json({ error: e.message });
  }
};
