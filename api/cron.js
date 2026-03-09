// api/cron.js — Football Lens News Engine v3
// Enhancements: beIN Sports, 90min, CBS Sports, trending queries,
// cross-source verification, defamation guard, hard attribution,
// evergreen content engine, post spacing awareness
// Triggered every 15 min via cron-job.org → POST /api/cron

// ── IMAGE POLICY (Legal Enforcement) ─────────────────────────────────────────
// Images may ONLY come from: DALL-E 3 (api/image.js), Unsplash, or Pexels
// NEVER scrape images from news websites — copyright violation
// All image usage must include source attribution when credit required

const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const TAVILY_KEY      = process.env.TAVILY_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const DASHBOARD_URL   = process.env.DASHBOARD_URL;

// ── SOURCES (8 sources including MENA) ───────────────────────────────────────
const RSS_SOURCES = [
  { name:"BBC Sport",      url:"https://feeds.bbci.co.uk/sport/football/rss.xml",      cred:95, lang:"en", tier:"MAJOR"    },
  { name:"Sky Sports",     url:"https://www.skysports.com/rss/12040",                   cred:94, lang:"en", tier:"MAJOR"    },
  { name:"ESPN FC",        url:"https://www.espn.com/espn/rss/soccer/news",             cred:93, lang:"en", tier:"MAJOR"    },
  { name:"Goal.com",       url:"https://www.goal.com/feeds/en/news",                    cred:89, lang:"en", tier:"MAJOR"    },
  { name:"UEFA Official",  url:"https://www.uefa.com/rssfeed/",                         cred:99, lang:"en", tier:"OFFICIAL" },
  { name:"90min",          url:"https://www.90min.com/posts.rss",                       cred:86, lang:"en", tier:"MAJOR"    },
  { name:"CBS Sports",     url:"https://www.cbssports.com/rss/headlines/soccer",        cred:88, lang:"en", tier:"MAJOR"    },
  { name:"beIN Sports EN", url:"https://www.beinsports.com/en-mena/rss",               cred:91, lang:"en", tier:"MENA"     },
];

const TAVILY_QUERIES = [
  "football breaking news today",
  "football transfer confirmed today",
  "Premier League La Liga Champions League news today",
  "كرة القدم اخبار عاجلة اليوم",
  "trending football social media today",
];

// Evergreen content pool — used when news is slow
const EVERGREEN_TOPICS = [
  { title:"Greatest Champions League comebacks in history",       tone:"STORY",    cred:85 },
  { title:"Top 5 transfers that shocked football this decade",    tone:"STORY",    cred:85 },
  { title:"Unbreakable football records — will anyone beat them?",tone:"DEBATE",   cred:85 },
  { title:"Forgotten football legends from the 2000s",           tone:"NOSTALGIC", cred:85 },
  { title:"Best free transfers in Premier League history",       tone:"STORY",    cred:85 },
  { title:"Rising stars to watch in European football",          tone:"STORY",    cred:85 },
  { title:"Most iconic football stadiums in the world",          tone:"STORY",    cred:85 },
];

// Fan engagement posts — zero sourcing needed, pure engagement
// 433-style: polls, debates, GOAT wars, fill the gap between news cycles
const FAN_ENGAGEMENT = [
  // POLLS
  { title:"Who wins the UCL this season?",                        tone:"POLL",  options:["Real Madrid","Man City","PSG","Bayern"] },
  { title:"Best left foot in football history?",                  tone:"POLL",  options:["Messi","Robben","Lahm","Bale"] },
  { title:"Pick the better peak — who was unplayable?",           tone:"POLL",  options:["Ronaldo 2008","Messi 2012","Ronaldinho 2005","Zidane 2002"] },
  { title:"Premier League title this season — who takes it?",     tone:"POLL",  options:["Arsenal","Man City","Liverpool","Chelsea"] },
  { title:"Best goalkeeper of all time?",                         tone:"POLL",  options:["Casillas","Buffon","Neuer","De Gea"] },
  { title:"Haaland or Mbappé — who finishes the season with more goals?", tone:"POLL", options:["Haaland","Mbappé"] },
  // DEBATES
  { title:"Messi vs Ronaldo — settle it once and for all",        tone:"DEBATE", options:[] },
  { title:"Greatest Premier League manager of all time?",         tone:"DEBATE", options:[] },
  { title:"Best Champions League final ever?",                    tone:"DEBATE", options:[] },
  { title:"Which era of football was the best to watch?",         tone:"DEBATE", options:[] },
  { title:"Who was better — prime Ronaldinho or prime Messi?",    tone:"DEBATE", options:[] },
  { title:"Best football nation of all time — Brazil or Spain?",  tone:"DEBATE", options:[] },
  // FAN REACTIONS
  { title:"One word to describe watching Mbappe at his best",     tone:"REACTION", options:[] },
  { title:"Describe the feeling of your team winning a derby in one word", tone:"REACTION", options:[] },
  { title:"Best football chant in world football?",               tone:"REACTION", options:[] },
];

// ── FETCH RSS ─────────────────────────────────────────────────────────────────
async function fetchRSS(source) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 6000);
    const res  = await fetch(source.url, {
      headers: { "User-Agent":"Mozilla/5.0 (compatible; FootballLensBot/3.0)" },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return [];
    const xml   = await res.text();
    const items = [];
    const re    = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) !== null && items.length < 8) {
      const b       = m[1];
      const title   = extractCDATA(b, "title");
      const desc    = extractCDATA(b, "description");
      const link    = (/<link>(.*?)<\/link>/s.exec(b)||[])[1]?.trim() || "";
      const pubDate = (/<pubDate>(.*?)<\/pubDate>/s.exec(b)||[])[1]?.trim() || "";
      if (!title || title.length < 10) continue;
      if (/^(advertisement|sponsored|newsletter|subscribe|sign up)/i.test(title)) continue;
      const age = pubDate ? (Date.now() - new Date(pubDate).getTime()) / 60000 : 999;
      if (age > 360) continue; // skip news older than 6 hours
      items.push({
        title, desc: cleanHtml(desc||"").slice(0,300), link,
        source:source.name, cred:source.cred, tier:source.tier, lang:source.lang,
        ageMinutes: Math.round(age),
      });
    }
    return items;
  } catch { return []; }
}

function extractCDATA(block, tag) {
  const m = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "s").exec(block);
  return m ? m[1].trim().replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").replace(/&quot;/g,'"') : "";
}
function cleanHtml(str) { return str.replace(/<[^>]+>/g,"").replace(/\s+/g," ").trim(); }

// ── TAVILY ────────────────────────────────────────────────────────────────────
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
      title:r.title, desc:(r.content||"").slice(0,300),
      link:r.url, source:"Tavily/"+query.slice(0,20), cred:80, tier:"WEB", lang:"en", ageMinutes:30,
    }));
  } catch { return []; }
}

// ── STRATEGY BRAIN ────────────────────────────────────────────────────────────
async function loadStrategy() {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=Strategy%20Brain&range=A1:B20`);
    const data = await res.json();
    const rows = data.data || [];
    const s = {};
    rows.forEach(r => { if (r[0]) s[r[0]] = r[1]; });
    return s;
  } catch { return null; }
}

// ── CROSS-SOURCE VERIFICATION ─────────────────────────────────────────────────
function crossVerify(items) {
  const groups = [];
  for (const item of items) {
    const words = item.title.toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s]/g,"").split(/\s+/)
      .filter(w => w.length > 3 && !["that","this","with","from","have","been","they","will","were","their","says","said"].includes(w));

    let matched = false;
    for (const group of groups) {
      const overlap    = words.filter(w => group.keywords.includes(w)).length;
      const similarity = overlap / Math.max(words.length, group.keywords.length, 1);
      if (similarity >= 0.25) {
        group.items.push(item);
        words.forEach(w => { if (!group.keywords.includes(w)) group.keywords.push(w); });
        matched = true; break;
      }
    }
    if (!matched) groups.push({ keywords:words, items:[item] });
  }

  return groups.map(group => {
    const sources     = [...new Set(group.items.map(i=>i.source))];
    const sourceCount = sources.length;
    const maxCred     = Math.max(...group.items.map(i=>i.cred));
    const avgCred     = Math.round(group.items.reduce((s,i)=>s+i.cred,0)/group.items.length);
    const bestItem    = group.items.sort((a,b)=>b.cred-a.cred)[0];
    const verScore    = sourceCount>=3?95 : sourceCount===2?85 : maxCred>=95?80 : maxCred>=90?70 : 55;
    return {
      ...bestItem, sourceCount, sources,
      allTitles: group.items.map(i=>`[${i.source}] ${i.title}`),
      verificationScore: verScore, avgCred,
      verified: sourceCount>=2 || maxCred>=95,
    };
  }).filter(g=>g.verificationScore>=55);
}

// ── AI SCORING + CLASSIFICATION ───────────────────────────────────────────────
async function scoreAndFilter(items) {
  if (!items.length) return [];
  const verified = crossVerify(items);
  if (!verified.length) return [];

  const list = verified.slice(0,15).map((item,i) =>
    `${i+1}. [${item.sourceCount} sources: ${item.sources.join(", ")}] ${item.title}`
  ).join("\n");

  const prompt = `You are a senior football news editor. Score and classify these verified headlines.

Headlines (each confirmed by number of sources shown):
${list}

For each, respond: INDEX|SCORE|TYPE
- SCORE: 0-100 (newsworthiness for global football fans)
- TYPE: BREAKING / TRANSFER / MATCH / TACTICAL / STORY / FUNNY / EVERGREEN / POLL / DEBATE / SKIP

Rules:
- Named player + confirmed transfer/goal/sack = 85-95
- 3+ sources confirming same story = +10 bonus on top
- Match result with real score = 80-90
- Official club/UEFA announcement = 90-99
- Generic promo / clickbait / no named entity = SKIP
- Single low-cred unverified rumour = SKIP
- Historical/nostalgic football story = EVERGREEN (60-75)

Respond ONLY in format: 1|87|MATCH — no explanation, no markdown.`;

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
        if (idx>=0 && idx<verified.length && type!=="SKIP" && score>=60) {
          scored.push({
            ...verified[idx], aiScore:score, contentType:type,
            finalScore: score + (verified[idx].sourceCount>=2?10:0),
          });
        }
      }
    });
    return scored.sort((a,b)=>b.finalScore-a.finalScore).slice(0,6);
  } catch {
    return verified.slice(0,4).map(i=>({...i, aiScore:70, contentType:"STORY", finalScore:70}));
  }
}

// ── FAN ENGAGEMENT POST GENERATOR (POLL / DEBATE / REACTION) ─────────────────
async function generateEngagementPost(item, strategy) {
  const toneHint  = strategy?.preferred_tone || "energetic and fan-first";
  const clubBoost = strategy?.top_clubs ? `Popular clubs for this audience: ${strategy.top_clubs}` : "";
  const isPoll    = item.tone === "POLL";
  const isDebate  = item.tone === "DEBATE";
  const options   = item.options?.length ? item.options.join(" / ") : "";

  const prompt = `You are Football Lens, a bilingual football media brand on X — inspired by @433's locker room energy.

CONTENT TYPE: ${item.tone}
TOPIC: "${item.title}"
${options ? `OPTIONS: ${options}` : ""}
${clubBoost}

Write a ${item.tone} post for football fans on X. Rules:

EN version (max 220 chars):
${isPoll ? `- Open with a bold question
- List 2-4 vote options using emojis (🔵 🔴 ⚪ 🟡)
- End with: "Vote below 👇"
- 1-2 emojis in opening` : ""}
${isDebate ? `- Open with a bold provocative statement or question
- Challenge fans to pick a side
- High energy, slightly opinionated
- 2 emojis, no hashtags needed — the debate IS the hook` : ""}
${item.tone === "REACTION" ? `- Ask fans to reply with ONE word or emoji
- Keep it warm, fun, inclusive
- "Drop it below 👇" at end` : ""}

AR version (max 220 chars):
- Gulf football fan voice — passionate, playful, NOT a translation
- Same poll options if POLL, but written in Arabic
- Match the energy of Arabic football Twitter culture
- No hashtags needed in AR

Note: No source attribution needed — this is pure fan engagement content.

Respond ONLY with JSON: {"en":"...","ar":"...","tone":"${item.tone}"}`;

  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:400, messages:[{role:"user",content:prompt}] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message||"Anthropic error");
  const raw  = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  const post = JSON.parse(raw);
  if (!post.en || !post.ar) throw new Error("Missing EN or AR");
  return { ...post, credibility:85, visualRecommended:false, source:"Football Lens" };
}

// ── DEFAMATION GUARD ──────────────────────────────────────────────────────────
function hasPersonalAllegation(title, desc) {
  const text = (title+" "+desc).toLowerCase();
  const flags = [
    "arrested","charged","convicted","scandal","fraud","abuse","assault",
    "rape","murder","banned for","found guilty","corruption","bribery",
    "drug test","doping","match fixing","bet fixing",
  ];
  return flags.some(f=>text.includes(f));
}

// ── GENERATE BILINGUAL POST ───────────────────────────────────────────────────
async function generatePost(item, strategy) {
  const toneHint  = strategy?.preferred_tone || "energetic and engaging";
  const clubBoost = strategy?.top_clubs ? `High-performing clubs: ${strategy.top_clubs}` : "";
  const srcContext = item.allTitles ?
    `\nCONFIRMED BY ${item.sourceCount} SOURCES:\n${item.allTitles.slice(0,3).join("\n")}` : "";

  // Legal guard: personal allegations require 2+ sources
  if (hasPersonalAllegation(item.title, item.desc) && (item.sourceCount||1) < 2) {
    throw new Error(`LEGAL_SKIP: Personal allegation in single-source story — "${item.title.slice(0,60)}"`);
  }

  const isEvergreen = item.contentType === "EVERGREEN" || item.tier === "EVERGREEN";

  const prompt = `You are Football Lens, a professional bilingual football media brand on X.

${isEvergreen ? "TOPIC (evergreen content):" : "REAL NEWS:"} "${item.title}"
${isEvergreen ? "" : `DETAILS: "${item.desc}"`}
SOURCE: ${item.source} (credibility: ${item.cred}%)${srcContext}
TYPE: ${item.contentType}
${clubBoost}

LEGAL CONTENT RULES (mandatory):
1. ONLY use confirmed facts — do NOT speculate or invent details
2. Do NOT copy article text — write 100% original content
3. Do NOT make personal allegations without confirmed multi-source backing
4. Source attribution MANDATORY — end EN post with "📌 via [source]"
5. Personal misconduct news: state facts only, no personal opinions

POST FORMAT:
- EN: max 240 chars (save space for attribution), 2 emojis, 2 hashtags, tone: ${toneHint}
- AR: max 240 chars, Arabic football commentary voice — passionate rewrite for Arab/Gulf audience, NOT a translation
- TYPE=BREAKING → start EN with 🚨
- TYPE=TRANSFER → name player AND both clubs explicitly
- TYPE=MATCH → include the score
- TYPE=EVERGREEN → storytelling voice, hook opening

Respond ONLY with valid JSON:
{"en":"...","ar":"...","credibility":${item.cred},"visualRecommended":${item.aiScore>=80},"tone":"${item.contentType}","source":"${item.source}"}`;

  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:500, messages:[{role:"user",content:prompt}] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message||"Anthropic error");
  const raw  = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  const post = JSON.parse(raw);
  if (!post.en || !post.ar) throw new Error("Missing EN or AR");

  // HARD attribution enforcement — guaranteed regardless of AI output
  if (!post.en.includes("📌") && !post.en.includes("via ")) {
    const attr = ` 📌 via ${item.source}`;
    post.en = post.en.length + attr.length <= 280
      ? post.en + attr
      : post.en.slice(0, 279 - attr.length) + "…" + attr;
  }

  return post;
}

// ── APPROVAL LOGIC ────────────────────────────────────────────────────────────
function getApproval(type, cred, score, sourceCount, verified) {
  const t  = (type||"").toUpperCase();
  const sc = sourceCount || 1;
  if (sc >= 3)                                      return { status:"Approved", label:`VERIFIED (${sc} sources) — auto-approved` };
  if (sc >= 2 && score >= 75)                       return { status:"Approved", label:`CONFIRMED (${sc} sources) — auto-approved` };
  if (t==="BREAKING" && cred>=90)                   return { status:"Approved", label:"BREAKING — auto-approved" };
  if (t==="TRANSFER" && cred>=90 && verified)       return { status:"Approved", label:"TRANSFER — auto-approved" };
  if (cred>=97)                                     return { status:"Approved", label:"OFFICIAL SOURCE — auto-approved" };
  if (t==="MATCH" && cred>=90 && score>=85)         return { status:"Approved", label:"MATCH RESULT — auto-approved" };
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

// ── LOG TO SHEET ──────────────────────────────────────────────────────────────
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
        row:[now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"), "news", generated, autoApproved, pending, note]
      }),
    });
  } catch {}
}

async function autoPostToX(post, rowIndex, sourceName) {
  if (!DASHBOARD_URL||!rowIndex) return;
  try {
    await fetch(`${DASHBOARD_URL}/api/post`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ textEN:post.en, textAR:post.ar, rowIndex, account:"BOTH", sourceName: sourceName||post.source||"Football Lens" }),
    });
  } catch {}
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  if (req.method==="OPTIONS") return res.status(200).end();
  if (!ANTHROPIC_KEY) return res.status(500).json({ error:"ANTHROPIC_API_KEY not set" });

  const results = { postsGenerated:0, autoApproved:0, pendingApproval:0, legalSkips:0, skipped:0, rssCount:0, tavilyCount:0, errors:[] };

  try {
    // 1. Fetch all sources in parallel
    const [rssSettled, ...tavilyArrays] = await Promise.all([
      Promise.allSettled(RSS_SOURCES.map(fetchRSS)),
      ...TAVILY_QUERIES.slice(0,2).map(q=>fetchTavily(q)),
    ]);
    const rssItems    = rssSettled.flatMap(r=>r.status==="fulfilled"?r.value:[]);
    const tavilyItems = tavilyArrays.flat();
    results.rssCount    = rssItems.length;
    results.tavilyCount = tavilyItems.length;
    const allItems = [...rssItems, ...tavilyItems];

    // 2. Dedup
    const recentHashes = await getRecentHashes();
    const seen = new Set();
    const uniqueItems = allItems.filter(item => {
      const h = hash(item.title);
      if (seen.has(h)||recentHashes.has(h)) return false;
      seen.add(h); return true;
    });

    // 3. AI score + filter
    let scoredItems = await scoreAndFilter(uniqueItems);
    results.skipped = uniqueItems.length - scoredItems.length;

    // 4. Engagement/Evergreen fill — always include 1 fan engagement post per run
    // (433 model: fill gaps between news with polls/debates to keep accounts active)
    const hour = new Date().getHours();
    const shouldAddEngagement = scoredItems.length < 4 || hour % 4 === 0; // every 4th run always adds one

    if (shouldAddEngagement) {
      // Alternate between poll/debate based on time to avoid repetition
      const engPool  = FAN_ENGAGEMENT;
      const evPool   = EVERGREEN_TOPICS;
      const useEngage = Math.random() > 0.35; // 65% chance engagement, 35% evergreen story
      const pool     = useEngage ? engPool : evPool;
      const pick     = pool[Math.floor(Math.random() * pool.length)];
      scoredItems.push({
        title:pick.title, desc:"", source:"Football Lens", cred:85,
        tier:"ENGAGEMENT", lang:"en", aiScore:75,
        contentType:pick.tone, options:pick.options||[],
        link:"", ageMinutes:0, sourceCount:1, verified:true, finalScore:75,
        isEngagement: useEngage,
      });
      results.engagement = true;
    }

    // Hard fallback: if still nothing at all
    if (scoredItems.length === 0) {
      const pick = EVERGREEN_TOPICS[0];
      scoredItems.push({
        title:pick.title, desc:"", source:"Football Lens", cred:85,
        tier:"EVERGREEN", lang:"en", aiScore:72, contentType:pick.tone,
        link:"", ageMinutes:0, sourceCount:1, verified:true, finalScore:72,
      });
    }

    // 5. Load strategy
    const strategy = await loadStrategy();

    // 6. Generate + log
    for (const item of scoredItems) {
      try {
        // Route to correct generator
        const isEngType = ["POLL","DEBATE","REACTION"].includes(item.contentType) || item.isEngagement;
        const post = isEngType
          ? await generateEngagementPost(item, strategy)
          : await generatePost(item, strategy);

        // Engagement posts: auto-approve (no sourcing risk, pure fan content)
        const approval = isEngType
          ? { status:"Approved", label:`${item.contentType} — auto-approved` }
          : getApproval(item.contentType, post.credibility||item.cred, item.finalScore||item.aiScore, item.sourceCount, item.verified);

        const rowIndex = await logPost(post, item, approval);
        results.postsGenerated++;
        if (approval.status==="Approved") {
          results.autoApproved++;
          if (rowIndex) await autoPostToX(post, rowIndex, item.source);
        } else {
          results.pendingApproval++;
        }
      } catch(e) {
        if (e.message.startsWith("LEGAL_SKIP")) results.legalSkips++;
        else results.errors.push(`${item.source}: ${e.message}`);
      }
    }

    const note = `RSS:${results.rssCount} Tavily:${results.tavilyCount} Scored:${scoredItems.length} Skipped:${results.skipped}${results.engagement?" [+engagement]":""}${results.legalSkips?` LegalSkip:${results.legalSkips}`:""}`;
    await logCronRun(results.postsGenerated, results.autoApproved, results.pendingApproval, note);
    return res.status(200).json({ success:true, ...results });

  } catch(e) {
    await logCronRun(0,0,0,`ERROR: ${e.message}`);
    return res.status(500).json({ error:e.message });
  }
};
