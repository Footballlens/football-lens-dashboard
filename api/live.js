// api/live.js — Football Lens Live Match Engine
// Triggered every 2 min via cron-job.org → POST https://your-app.vercel.app/api/live
// Monitors kooora.com for live scores and instantly posts goals/events to X

const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const DASHBOARD_URL   = process.env.DASHBOARD_URL;

// Competitions to monitor
const MONITORED_COMPETITIONS = [
  "دوري أبطال أوروبا", "Champions League", "UCL",
  "الدوري الإنجليزي", "Premier League", "PL",
  "الدوري الإسباني", "La Liga",
  "الدوري الإيطالي", "Serie A",
  "الدوري الألماني", "Bundesliga",
  "الدوري الفرنسي", "Ligue 1",
  "الدوري الأوروبي", "Europa League", "UEL",
  "كأس العالم", "World Cup",
  "يورو", "Euros", "Nations League",
];

// ── SCRAPE KOOORA LIVE SCORES ─────────────────────────────────────────────────
async function scrapeKooora() {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 8000);
    const res  = await fetch("https://www.kooora.com/?matches", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ar,en;q=0.9",
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const html = await res.text();
    return parseKooora(html);
  } catch(e) {
    return { matches:[], error:e.message };
  }
}

function parseKooora(html) {
  const matches = [];
  // Extract match blocks — kooora uses divs with class "match" or similar
  const matchBlocks = html.match(/class="[^"]*match[^"]*"[^>]*>([\s\S]*?)(?=class="[^"]*match[^"]*"|<\/div>\s*<\/div>)/g) || [];

  // Fallback: extract score patterns directly
  const scorePattern = /(\d{1,3})\s*[-:]\s*(\d{1,3})/g;
  const teamPattern  = /<[^>]+class="[^"]*team[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/g;

  // Try to extract structured match data
  const liveIndicators = ["LIVE", "live", "يلعب", "جارٍ", "مباشر", "HT", "شوط"];
  const goalIndicators = ["goal", "هدف", "⚽", "scored"];

  // Simple extraction: look for score containers
  const scoreContainers = html.match(/data-home[^>]*>([\s\S]*?)data-away/g) || [];

  // Extract any JSON data embedded in page
  const jsonMatches = html.match(/matchData\s*=\s*(\[[\s\S]*?\]);/);
  if (jsonMatches) {
    try {
      const data = JSON.parse(jsonMatches[1]);
      data.forEach(m => {
        if (m.status === "live" || m.status === "LIVE") {
          matches.push({
            id: m.id || m.matchId || String(m.home+m.away),
            home: m.home || m.homeTeam,
            away: m.away || m.awayTeam,
            homeScore: parseInt(m.homeScore||m.score1||0),
            awayScore: parseInt(m.awayScore||m.score2||0),
            minute: m.minute || m.min || "?",
            competition: m.competition || m.league || "Football",
            status: "LIVE",
            events: m.events || [],
          });
        }
      });
    } catch {}
  }

  // If no structured data, do text-based extraction
  if (matches.length === 0) {
    // Look for live match score patterns in HTML
    const liveBlocks = html.split(/(?=<[^>]+(?:live|مباشر|يلعب)[^>]*>)/i);
    liveBlocks.slice(0,10).forEach(block => {
      const scoreM = /(\d+)\s*[:\-]\s*(\d+)/.exec(block);
      const minM   = /(\d+)[\'']/.exec(block);
      const compM  = MONITORED_COMPETITIONS.find(c => block.includes(c));
      if (scoreM && compM) {
        // Extract team names (simplified)
        const teams = block.match(/[\u0600-\u06FF\w\s]{3,30}(?=\s*\d)/g) || [];
        matches.push({
          id: `${scoreM[1]}-${scoreM[2]}-${minM?.[1]||"?"}`,
          home: teams[0]?.trim() || "Home",
          away: teams[1]?.trim() || "Away",
          homeScore: parseInt(scoreM[1]),
          awayScore: parseInt(scoreM[2]),
          minute: minM?.[1] || "?",
          competition: compM,
          status: "LIVE",
          events: [],
        });
      }
    });
  }

  return { matches, html_length: html.length };
}

// ── LOAD POSTED EVENTS (dedup) ────────────────────────────────────────────────
async function getPostedEvents() {
  if (!APPS_SCRIPT_URL) return new Set();
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=Live%20Events&range=A1:A200`);
    const data = await res.json();
    return new Set((data.data||[]).map(r=>r[0]).filter(Boolean));
  } catch { return new Set(); }
}

async function markEventPosted(eventKey) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"Live Events",
        row:[ eventKey, new Date().toISOString() ]
      }),
    });
  } catch {}
}

// ── GENERATE LIVE MATCH POST ───────────────────────────────────────────────────
async function generateLivePost(match, eventType, eventDetail) {
  const prompt = `You are Football Lens, a bilingual football media brand. Write an INSTANT live match post for X.

Match: ${match.home} ${match.homeScore} - ${match.awayScore} ${match.away}
Competition: ${match.competition}
Minute: ${match.minute}'
Event: ${eventType}
Detail: ${eventDetail}

Rules:
- This is LIVE — write with urgency and excitement
- EN: max 240 chars, 2-3 emojis, match hashtags (team names + competition)
- AR: max 240 chars, Arabic football commentary style, high energy
- Include current score in BOTH versions
- BREAKING or GOAL posts start with 🚨⚽ respectively

Respond ONLY with JSON (no markdown):
{"en":"...","ar":"..."}`;

  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:350, messages:[{role:"user",content:prompt}] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const raw  = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  return JSON.parse(raw);
}

// ── LOG + POST ─────────────────────────────────────────────────────────────────
async function logAndPost(post, match, eventType) {
  if (!APPS_SCRIPT_URL) return;
  const now = new Date();
  try {
    const res  = await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"Posts Log",
        row:[
          now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"),
          "Match Update", eventType, post.en, post.ar,
          "kooora.com", "", 90, "NO", "BOTH", "Approved", "","","","","","","","",
        ]
      }),
    });
    const data = await res.json();
    const rowIndex = data.rowIndex||null;
    if (rowIndex && DASHBOARD_URL) {
      await fetch(`${DASHBOARD_URL}/api/post`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ textEN:post.en, textAR:post.ar, rowIndex, account:"BOTH" }),
      }).catch(()=>{});
    }
  } catch {}
}

// ── MAIN ───────────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  if (req.method==="OPTIONS") return res.status(200).end();
  if (!ANTHROPIC_KEY) return res.status(500).json({ error:"ANTHROPIC_API_KEY not set" });

  const results = { matchesFound:0, eventsDetected:0, postsCreated:0, errors:[] };

  try {
    const { matches, error:scrapeError } = await scrapeKooora();
    results.matchesFound = matches.length;
    results.scrapeError  = scrapeError;

    if (matches.length === 0) {
      return res.status(200).json({ success:true, ...results, note:"No live matches found" });
    }

    const postedEvents = await getPostedEvents();

    for (const match of matches) {
      // Check if competition is monitored
      const isMonitored = MONITORED_COMPETITIONS.some(c =>
        (match.competition||"").toLowerCase().includes(c.toLowerCase()) ||
        c.toLowerCase().includes((match.competition||"").toLowerCase())
      );
      if (!isMonitored) continue;

      // Detect events to post about
      const eventsToPost = [];

      // Score change detection
      const scoreKey = `${match.id}_${match.homeScore}-${match.awayScore}`;
      if (!postedEvents.has(scoreKey)) {
        eventsToPost.push({
          key: scoreKey,
          type: "GOAL",
          detail: `${match.home} ${match.homeScore} - ${match.awayScore} ${match.away} (${match.minute}')`,
        });
      }

      // Half time
      if (match.minute === "HT" || match.minute === "45+") {
        const htKey = `${match.id}_HT`;
        if (!postedEvents.has(htKey)) {
          eventsToPost.push({ key:htKey, type:"HALF TIME", detail:`Half Time: ${match.home} ${match.homeScore} - ${match.awayScore} ${match.away}` });
        }
      }

      // Full time
      if (match.status === "FT" || match.minute === "90+") {
        const ftKey = `${match.id}_FT`;
        if (!postedEvents.has(ftKey)) {
          eventsToPost.push({ key:ftKey, type:"FULL TIME", detail:`Final Score: ${match.home} ${match.homeScore} - ${match.awayScore} ${match.away}` });
        }
      }

      results.eventsDetected += eventsToPost.length;

      for (const event of eventsToPost) {
        try {
          const post = await generateLivePost(match, event.type, event.detail);
          await logAndPost(post, match, event.type);
          await markEventPosted(event.key);
          results.postsCreated++;
        } catch(e) {
          results.errors.push(`${match.home} vs ${match.away}: ${e.message}`);
        }
      }
    }

    return res.status(200).json({ success:true, ...results });
  } catch(e) {
    return res.status(500).json({ error:e.message });
  }
};
