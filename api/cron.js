// api/cron.js — Football Lens News Engine v3
// Triggered every 15 min via cron-job.org → POST https://your-app.vercel.app/api/cron

const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const TAVILY_KEY      = process.env.TAVILY_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const DASHBOARD_URL   = process.env.DASHBOARD_URL;

// ── SOURCES ───────────────────────────────────────────────────────────────────
const RSS_SOURCES = [
  { name:"BBC Sport",       url:"https://feeds.bbci.co.uk/sport/football/rss.xml",           cred:95, lang:"en", tier:"MAJOR"    },
  { name:"Sky Sports",      url:"https://www.skysports.com/rss/12040",                        cred:94, lang:"en", tier:"MAJOR"    },
  { name:"ESPN FC",         url:"https://www.espn.com/espn/rss/soccer/news",                  cred:93, lang:"en", tier:"MAJOR"    },
  { name:"Goal.com",        url:"https://www.goal.com/feeds/en/news",                         cred:89, lang:"en", tier:"MAJOR"    },
  { name:"UEFA Official",   url:"https://www.uefa.com/rssfeed/",                              cred:99, lang:"en", tier:"OFFICIAL" },
];

const TAVILY_QUERIES = [
  "football breaking news today",
  "football transfer news confirmed today",
  "Premier League La Liga Serie A news today",
  "كرة القدم اخبار اليوم",           // Arabic football news
  "beIN sports football news today",
];

// ── FETCH RSS ─────────────────────────────────────────────────────────────────
async function fetchRSS(source) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 6000);
    const res  = await fetch(source.url, {
      headers: { "User-Agent":"Mozilla/5.0 (compatible; FootballLensBot/2.0)" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const xml   = await res.text();
    const items = [];
    const re    = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) !== null && items.length < 8) {
      const b     = m[1];
      const title = extractCDATA(b, "title");
      const desc  = extractCDATA(b, "description");
      const link  = (/<link>(.*?)<\/link>/s.exec(b)||[])[1]?.trim() || "";
      const pubDate = (/<pubDate>(.*?)<\/pubDate>/s.exec(b)||[])[1]?.trim() || "";
      if (!title || title.length < 10) continue;
      // Filter out ads and generic promos
      if (/^(advertisement|sponsored|newsletter|subscribe|sign up)/i.test(title)) continue;
      const age = pubDate ? (Date.now() - new Date(pubDate).getTime()) / 60000 : 999;
      items.push({ title, desc: cleanHtml(desc||"").slice(0,300), link, source:source.name, cred:source.cred, tier:source.tier, lang:source.lang, ageMinutes: Math.round(age) });
    }
    return items;
  } catch { return []; }
}

function extractCDATA(block, tag) {
  const m = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "s").exec(block);
  return m ? m[1].trim().replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"') : "";
}

function cleanHtml(str) {
  return str.replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim();
}

// ── TAVILY FETCH ──────────────────────────────────────────────────────────────
async function fetchTavily(query) {
  if (!TAVILY_KEY) return [];
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 6000);
    const res  = await fetch("https://api.tavily.com/search", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ api_key:TAVILY_KEY, query, max_results:5, search_depth:"basic" }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const data = await res.json();
    return (data.results||[]).map(r => ({
      title: r.title, desc: (r.content||"").slice(0,300),
      link: r.url, source:"Tavily/"+query.slice(0,20), cred:82, tier:"WEB", lang:"en", ageMinutes:30,
    }));
  } catch { return []; }
}

// ── LOAD STRATEGY FROM SHEET ──────────────────────────────────────────────────
async function loadStrategy() {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=Strategy%20Brain&range=A1:B20`);
    const data = await res.json();
    const rows = data.data || [];
    const strategy = {};
    rows.forEach(r => { if (r[0]) strategy[r[0]] = r[1]; });
    return strategy;
  } catch { return null; }
}

// ── AI SCORING — filter junk before generating ────────────────────────────────
async function scoreAndFilter(items) {
  if (!items.length) return [];
  const list = items.slice(0,20).map((item,i) => `${i+1}. [${item.source}] ${item.title}`).join("\n");
  const prompt = `You are a football news editor. Score each headline for posting on X.

Headlines:
${list}

For each, respond with: INDEX|SCORE|TYPE|SKIP_REASON
- SCORE: 0-100 (how interesting/relevant for football fans)
- TYPE: BREAKING / TRANSFER / MATCH / TACTICAL / STORY / FUNNY / SKIP
- SKIP_REASON: if TYPE=SKIP, why (PROMO/DUPLICATE/NOT_FOOTBALL/TOO_OLD/GENERIC)

Rules:
- Named player + real action = high score (85+)
- Generic "transfer window" with no names = SKIP/PROMO
- Official club/league announcement = 90+
- Rumour with credible source = 75+
- "Top 10 best goals ever" = STORY, score 60
- Anything that isn't actual football news = SKIP

Respond ONLY with lines in format: 1|87|TRANSFER|
No explanation, no markdown.`;

  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:400, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    const text = (data.content||[]).map(c=>c.text||"").join("");
    const scored = [];
    text.split("\n").forEach(line => {
      const parts = line.trim().split("|");
      if (parts.length >= 3) {
        const idx   = parseInt(parts[0]) - 1;
        const score = parseInt(parts[1]);
        const type  = parts[2].trim();
        if (idx >= 0 && idx < items.length && type !== "SKIP" && score >= 60) {
          scored.push({ ...items[idx], aiScore:score, contentType:type });
        }
      }
    });
    return scored.sort((a,b) => b.aiScore - a.aiScore).slice(0,6);
  } catch { return items.slice(0,4).map(i => ({...i, aiScore:70, contentType:"STORY"})); }
}

// ── GENERATE BILINGUAL POST ────────────────────────────────────────────────────
async function generatePost(item, strategy) {
  const toneHint = strategy?.preferred_tone || "energetic and engaging";
  const clubBoost = strategy?.top_clubs ? `High-performing clubs to prioritise: ${strategy.top_clubs}` : "";

  const prompt = `You are Football Lens, a bilingual football media brand on X.

REAL NEWS: "${item.title}"
DETAILS: "${item.desc}"
SOURCE: ${item.source} (credibility: ${item.cred}%)
TYPE: ${item.contentType}
${clubBoost}

Write ONE post for X. Strict rules:
- EN version: max 250 chars, 2-3 emojis, 2 relevant hashtags, tone: ${toneHint}
- AR version: max 250 chars, natural Arabic (not translation — rewrite for Arab audience), same energy
- ONLY use facts from the news provided — do NOT invent names, clubs, or scores
- If TYPE=TRANSFER: mention the player/club names from the headline
- If TYPE=BREAKING: start with 🚨
- If TYPE=FUNNY: use wit and sarcasm
- Source credit if official: add "📌 via ${item.source}" at end of EN

Respond ONLY with valid JSON (no markdown, no extra text):
{"en":"...","ar":"...","credibility":${item.cred},"visualRecommended":${item.aiScore>=80},"tone":"${item.contentType}"}`;

  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:500, messages:[{role:"user",content:prompt}] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message||"Anthropic error");
  const raw  = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  const post = JSON.parse(raw);
  if (!post.en || !post.ar) throw new Error("Missing EN or AR in response");
  return post;
}

// ── APPROVAL LOGIC ─────────────────────────────────────────────────────────────
function getApproval(type, cred, score) {
  const t = (type||"").toUpperCase();
  if (t === "BREAKING")  return { status:"Approved", label:"BREAKING — auto-approved" };
  if (t === "TRANSFER" && cred >= 85) return { status:"Approved", label:"TRANSFER — auto-approved" };
  if (cred >= 95)        return { status:"Approved", label:"OFFICIAL — auto-approved" };
  if (score >= 90)       return { status:"Approved", label:"HIGH SCORE — auto-approved" };
  return { status:"Pending", label:null };
}

// ── DEDUP ─────────────────────────────────────────────────────────────────────
function hash(text) {
  let h = 0;
  for (const c of (text||"").toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,60))
    h = ((h<<5)-h)+c.charCodeAt(0);
  return (h>>>0).toString(36);
}

async function getRecentHashes() {
  if (!APPS_SCRIPT_URL) return new Set();
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=Posts%20Log&range=E1:E200`);
    const data = await res.json();
    return new Set((data.data||[]).map(r=>hash(r[0])));
  } catch { return new Set(); }
}

// ── LOG TO SHEET ───────────────────────────────────────────────────────────────
async function logPost(post, item, approval) {
  if (!APPS_SCRIPT_URL) return null;
  const now = new Date();
  try {
    const res  = await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"Posts Log",
        row:[
          now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"),
          item.contentType, post.tone||item.contentType,
          post.en, post.ar,
          item.source, item.link||"",
          post.credibility||item.cred, post.visualRecommended?"YES":"NO",
          "BOTH", approval.status, "","","","","","","","",
        ]
      }),
    });
    const data = await res.json();
    return data.rowIndex||null;
  } catch { return null; }
}

async function logCronRun(generated, autoApproved, pending, note) {
  if (!APPS_SCRIPT_URL) return;
  try {
    const now = new Date();
    await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"AI Dashboard",
        row:[ now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"), "news", generated, autoApproved, pending, note ]
      }),
    });
  } catch {}
}

async function autoPostToX(post, rowIndex) {
  if (!DASHBOARD_URL||!rowIndex) return;
  try {
    await fetch(`${DASHBOARD_URL}/api/post`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ textEN:post.en, textAR:post.ar, rowIndex, account:"BOTH" }),
    });
  } catch {}
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  if (req.method==="OPTIONS") return res.status(200).end();
  if (!ANTHROPIC_KEY) return res.status(500).json({ error:"ANTHROPIC_API_KEY not set" });

  const results = { postsGenerated:0, autoApproved:0, pendingApproval:0, skipped:0, rssCount:0, tavilyCount:0, errors:[] };

  try {
    // 1. Fetch all sources in parallel
    const [rssResults, ...tavilyResults] = await Promise.all([
      Promise.allSettled(RSS_SOURCES.map(fetchRSS)),
      ...TAVILY_QUERIES.slice(0,2).map(q => fetchTavily(q)), // limit to 2 Tavily queries to save quota
    ]);

    const rssItems    = rssResults.flatMap(r => r.status==="fulfilled" ? r.value : []);
    const tavilyItems = tavilyResults.flat();
    results.rssCount    = rssItems.length;
    results.tavilyCount = tavilyItems.length;

    const allItems = [...rssItems, ...tavilyItems];

    // 2. Dedup
    const recentHashes = await getRecentHashes();
    const seen = new Set();
    const uniqueItems = allItems.filter(item => {
      const h = hash(item.title);
      if (seen.has(h)||recentHashes.has(h)) return false;
      seen.add(h);
      return true;
    });

    // 3. AI scoring — filter junk
    const scoredItems = await scoreAndFilter(uniqueItems);
    results.skipped = uniqueItems.length - scoredItems.length;

    // 4. Load strategy (for tone/club preferences from engagement engine)
    const strategy = await loadStrategy();

    // 5. Fallback if nothing scored
    if (scoredItems.length === 0) {
      const day = new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
      scoredItems.push({
        title:`Football talking points — ${day}`,
        desc:"Key stories, debates and moments in football this week",
        source:"Football Lens", cred:78, tier:"EVERGREEN", lang:"en",
        aiScore:65, contentType:"STORY", link:"", ageMinutes:0,
      });
      results.fallback = true;
    }

    // 6. Generate posts one by one
    for (const item of scoredItems) {
      try {
        const post     = await generatePost(item, strategy);
        const approval = getApproval(item.contentType, post.credibility||item.cred, item.aiScore);
        const rowIndex = await logPost(post, item, approval);
        results.postsGenerated++;
        if (approval.status==="Approved") {
          results.autoApproved++;
          if (rowIndex) await autoPostToX(post, rowIndex);
        } else {
          results.pendingApproval++;
        }
      } catch(e) {
        results.errors.push(`${item.source}: ${e.message}`);
      }
    }

    const note = `RSS:${results.rssCount} Tavily:${results.tavilyCount} Scored:${scoredItems.length} Skipped:${results.skipped}${results.fallback?" [fallback]":""}`;
    await logCronRun(results.postsGenerated, results.autoApproved, results.pendingApproval, note);
    return res.status(200).json({ success:true, ...results });

  } catch(e) {
    await logCronRun(0,0,0,`ERROR: ${e.message}`);
    return res.status(500).json({ error:e.message });
  }
};
