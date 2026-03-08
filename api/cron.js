// api/cron.js — Autonomous AI Football Media Engine
// Runs every 15 min via Vercel cron (or manually triggered)

const ANTHROPIC_URL   = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const TAVILY_KEY      = process.env.TAVILY_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const DASHBOARD_URL   = process.env.DASHBOARD_URL;

// ── RSS SOURCES ─────────────────────────────────────────────────────────────
const RSS_SOURCES = [
  { name:"ESPN FC",      url:"https://www.espn.com/espn/rss/soccer/news",         cred:93, tier:"MAJOR" },
  { name:"Sky Sports",   url:"https://www.skysports.com/rss/12040",                cred:94, tier:"MAJOR" },
  { name:"BBC Sport",    url:"https://feeds.bbci.co.uk/sport/football/rss.xml",    cred:95, tier:"MAJOR" },
  { name:"Goal.com",     url:"https://www.goal.com/feeds/en/news",                 cred:89, tier:"MAJOR" },
  { name:"UEFA",         url:"https://www.uefa.com/rssfeed/",                      cred:99, tier:"OFFICIAL" },
];

// ── FETCH RSS ────────────────────────────────────────────────────────────────
async function fetchRSS(source) {
  try {
    const res  = await fetch(source.url, { headers:{ "User-Agent":"FootballLensBot/1.0" }, signal: AbortSignal.timeout(8000) });
    const xml  = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const item  = match[1];
      const title = (/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s.exec(item)||[])[1]?.trim();
      const desc  = (/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/s.exec(item)||[])[1]?.replace(/<[^>]+>/g,"").trim().slice(0,200);
      const link  = (/<link>(.*?)<\/link>/s.exec(item)||[])[1]?.trim();
      const date  = (/<pubDate>(.*?)<\/pubDate>/s.exec(item)||[])[1]?.trim();
      if (title && title.length > 10) items.push({ title, desc, link, date, source: source.name, cred: source.cred, tier: source.tier });
    }
    return items;
  } catch { return []; }
}

// ── TAVILY SEARCH ─────────────────────────────────────────────────────────────
async function tavilySearch(query) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ api_key: TAVILY_KEY, query, max_results:5, search_depth:"basic" }),
    });
    const data = await res.json();
    return (data.results||[]).map(r => ({ title:r.title, desc:r.content?.slice(0,200), link:r.url, source:"Tavily", cred:85, tier:"MAJOR" }));
  } catch { return []; }
}

// ── DEDUP ────────────────────────────────────────────────────────────────────
function hashTopic(text) {
  let h = 0;
  for (const c of (text||"").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,60)) h = ((h<<5)-h)+c.charCodeAt(0);
  return (h>>>0).toString(36);
}

async function getRecentHashes() {
  if (!APPS_SCRIPT_URL) return new Set();
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=Posts Log&range=E5:E50`);
    const data = await res.json();
    return new Set((data.data||[]).map(r => hashTopic(r[0])));
  } catch { return new Set(); }
}

// ── CLASSIFY NEWS ITEM ────────────────────────────────────────────────────────
function classifyItem(item) {
  const text = (item.title+" "+(item.desc||"")).toLowerCase();
  if (/transfer|sign|deal|contract|join|move|agree|complet|done deal/.test(text)) return { type:"Transfer News", tone:"Transfer", priority:1 };
  if (/breaking|urgent|official|confirm|announce|sack|resign|injur/.test(text)) return { type:"Breaking News", tone:"Breaking", priority:1 };
  if (/goal|score|win|loss|draw|result|final|match|live|minute/.test(text)) return { type:"Match Update", tone:"Excitement", priority:2 };
  if (/tactic|formation|analysis|breakdown|strategy|press|possession/.test(text)) return { type:"Tactical Analysis", tone:"Analytical", priority:3 };
  return { type:"Football News", tone:"General", priority:2 };
}

// ── APPROVAL DECISION ────────────────────────────────────────────────────────
function getApprovalDecision(type, tone, cred, tier) {
  const t = (type+tone).toLowerCase();
  if (t.includes("break") || t.includes("urgent")) return { status:"Approved", autoLabel:"BREAKING — auto-approved" };
  if (t.includes("transfer") || t.includes("done deal")) return { status:"Approved", autoLabel:"TRANSFER — auto-approved" };
  if (cred >= 95 && tier === "OFFICIAL") return { status:"Approved", autoLabel:"OFFICIAL SOURCE — auto-approved" };
  return { status:"Pending", autoLabel:null };
}

// ── GENERATE POST VIA CLAUDE ─────────────────────────────────────────────────
async function generatePost(item, classification) {
  const sourceLabel = item.tier === "OFFICIAL" ? `Source: ${item.source}` : "";
  const breakingPrefix = classification.tone === "Breaking" ? "🚨 BREAKING\n" : classification.tone === "Transfer" ? "🔄 TRANSFER UPDATE\n" : "";

  const prompt = `You are Football Lens, a bilingual (EN/AR) football media brand on X (Twitter).

News item: "${item.title}"
Details: "${item.desc || ""}"
Source: ${item.source} (credibility: ${item.cred}%)
Content type: ${classification.type}
Tone: ${classification.tone}

Write a post for X. Rules:
- EN: max 260 chars, use emojis, relevant hashtags, exciting tone matching content type
- AR: max 260 chars, natural Modern Standard Arabic, same energy as EN
- If breaking/transfer: start with ${breakingPrefix || "appropriate emoji"}
- Include source credit if official: "${sourceLabel}"
- Do NOT copy — rewrite creatively

Respond ONLY with valid JSON (no markdown, no explanation):
{"en":"English post","ar":"Arabic post","credibility":${item.cred},"visualRecommended":${classification.priority <= 2},"imagePrompt":"DALL-E football image prompt","hashtags":["tag1","tag2"]}`;

  const res  = await fetch(ANTHROPIC_URL, {
    method:"POST",
    headers:{ "Content-Type":"application/json", "x-api-key":ANTHROPIC_KEY, "anthropic-version":"2023-06-01" },
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:600, messages:[{ role:"user", content:prompt }] }),
  });
  const data = await res.json();
  const text = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  return JSON.parse(text);
}

// ── LOG TO SHEET ──────────────────────────────────────────────────────────────
async function logPost(post, item, classification, approval) {
  if (!APPS_SCRIPT_URL) return null;
  const now = new Date();
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"Posts Log",
        row:[
          now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"),
          classification.type, classification.tone,
          post.en, post.ar,
          item.source, item.link||"",
          post.credibility||item.cred,
          post.visualRecommended?"YES":"NO",
          "BOTH", approval.status, "", "", "", "", "", "", "", "",
        ]
      }),
    });
    const data = await res.json();
    return data.rowIndex;
  } catch { return null; }
}

// ── AUTO POST TO X ────────────────────────────────────────────────────────────
async function autoPost(post, rowIndex) {
  if (!DASHBOARD_URL) return;
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

// ── MAIN HANDLER ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!ANTHROPIC_KEY) return res.status(500).json({ error:"ANTHROPIC_API_KEY not configured" });

  const results = { postsGenerated:0, autoApproved:0, pendingApproval:0, sources:[], errors:[] };

  try {
    // 1. Fetch news from all RSS sources + Tavily
    const [rssItems, tavilyItems] = await Promise.all([
      Promise.all(RSS_SOURCES.map(fetchRSS)).then(all => all.flat()),
      tavilySearch("football news today transfer breaking"),
    ]);

    const allItems = [...rssItems, ...tavilyItems].filter(i => i.title);
    const recentHashes = await getRecentHashes();

    // 2. Deduplicate and prioritize
    const seen = new Set();
    const uniqueItems = allItems
      .filter(item => {
        const h = hashTopic(item.title);
        if (seen.has(h) || recentHashes.has(h)) return false;
        seen.add(h);
        return true;
      })
      .map(item => ({ ...item, classification: classifyItem(item) }))
      .sort((a,b) => a.classification.priority - b.classification.priority)
      .slice(0, 4); // max 4 posts per run

    if (uniqueItems.length === 0) {
      // Fallback: generate evergreen content (clearly labeled as AI-generated, not real news)
      const day = new Date().toLocaleDateString("en-GB", { day:"numeric", month:"long" });
      const evergreen = [
        { title:`On this day in football: historic moments on ${day}`, desc:"A look back at legendary football moments on this date", source:"Football Lens AI", cred:78, tier:"EVERGREEN" },
        { title:"Weekend football preview: matches to watch this weekend", desc:"Key fixtures and what to look out for", source:"Football Lens AI", cred:78, tier:"EVERGREEN" },
        { title:"Football debate: greatest Premier League managers of all time", desc:"Who tops the list?", source:"Football Lens AI", cred:78, tier:"EVERGREEN" },
      ];
      const pick = evergreen[Math.floor(Math.random()*evergreen.length)];
      uniqueItems.push({ ...pick, classification: { type:"Football Story", tone:"Nostalgic", priority:3 } });
      results.fallback = true;
    }

    // 3. Generate + log posts
    for (const item of uniqueItems) {
      try {
        const post     = await generatePost(item, item.classification);
        const approval = getApprovalDecision(item.classification.type, item.classification.tone, post.credibility||item.cred, item.tier);
        const rowIndex = await logPost(post, item, item.classification, approval);

        results.postsGenerated++;
        results.sources.push(item.source);

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

    results.rssCount = rssItems.length;
    results.tavilyCount = tavilyItems.length;
    results.uniqueCount = uniqueItems.length;
    await logCronRun("news", results.postsGenerated, results.autoApproved, results.pendingApproval,
      `Sources: ${[...new Set(results.sources)].join(", ")}`);

    return res.status(200).json({ success:true, ...results });

  } catch (e) {
    await logCronRun("error", 0, 0, 0, e.message);
    return res.status(500).json({ error:e.message });
  }
};
