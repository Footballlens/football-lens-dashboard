// api/live.js — Football Lens Live Match Engine v2
// Uses football-data.org for real team names, accurate scores
// Events: KICK_OFF, GOAL, HALF_TIME, FULL_TIME
// Triggered every 2 min via cron-job.org

const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;
const APPS_SCRIPT_URL  = process.env.APPS_SCRIPT_URL;
const DASHBOARD_URL    = process.env.DASHBOARD_URL;

const COMPETITIONS = [2021,2014,2019,2002,2015,2001,2048,2000,2018];
const COMP_EN = { 2021:"Premier League",2014:"La Liga",2019:"Serie A",2002:"Bundesliga",2015:"Ligue 1",2001:"Champions League",2048:"Europa League",2000:"World Cup",2018:"Euros" };
const COMP_AR = { 2021:"الدوري الإنجليزي",2014:"الدوري الإسباني",2019:"الدوري الإيطالي",2002:"الدوري الألماني",2015:"الدوري الفرنسي",2001:"دوري أبطال أوروبا",2048:"الدوري الأوروبي",2000:"كأس العالم",2018:"يورو" };

async function apiGet(path) {
  if (!FOOTBALL_API_KEY) return null;
  const ctrl = new AbortController();
  const t    = setTimeout(()=>ctrl.abort(),8000);
  try {
    const res  = await fetch(`https://api.football-data.org/v4/${path}`, {
      headers:{"X-Auth-Token":FOOTBALL_API_KEY}, signal:ctrl.signal
    });
    clearTimeout(t);
    return await res.json();
  } catch { clearTimeout(t); return null; }
}

function mapMatch(m) {
  return {
    id:        String(m.id),
    compId:    m.competition?.id,
    comp:      COMP_EN[m.competition?.id] || m.competition?.name,
    compAr:    COMP_AR[m.competition?.id] || m.competition?.name,
    home:      m.homeTeam?.shortName||m.homeTeam?.name,
    away:      m.awayTeam?.shortName||m.awayTeam?.name,
    homeFull:  m.homeTeam?.name,
    awayFull:  m.awayTeam?.name,
    homeScore: m.score?.fullTime?.home??m.score?.halfTime?.home??0,
    awayScore: m.score?.fullTime?.away??m.score?.halfTime?.away??0,
    status:    m.status,
    minute:    m.minute||"?",
    stage:     m.stage||"",
  };
}

async function fetchLive() {
  const data = await apiGet(`matches?status=IN_PLAY,PAUSED&competitions=${COMPETITIONS.join(",")}`);
  return (data?.matches||[]).map(mapMatch);
}

async function fetchFinished() {
  const today = new Date().toISOString().split("T")[0];
  const data  = await apiGet(`matches?status=FINISHED&dateFrom=${today}&dateTo=${today}&competitions=${COMPETITIONS.join(",")}`);
  return (data?.matches||[]).map(mapMatch);
}

async function getPostedEvents() {
  if (!APPS_SCRIPT_URL) return new Set();
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=Live%20Events&range=A1:A500`);
    const data = await res.json();
    return new Set((data.data||[]).map(r=>r[0]).filter(Boolean));
  } catch { return new Set(); }
}

async function markPosted(key) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"append", sheet:"Live Events", row:[key, new Date().toISOString()] }),
    });
  } catch {}
}

async function generateLivePost(match, eventType) {
  if (!ANTHROPIC_KEY) return null;
  const score = `${match.home} ${match.homeScore}-${match.awayScore} ${match.away}`;
  const comp  = `${match.comp} (${match.compAr})`;

  const instructions = {
    KICK_OFF:   "• Build hype and excitement for this match\n• Mention both teams and competition",
    GOAL:       "• Start EN with ⚽ GOAL! — maximum energy\n• Include the current score\n• AR: use GOOOOOL celebration style",
    HALF_TIME:  "• Half-time summary — include score and quick analysis\n• Who's playing better?",
    FULL_TIME:  "• Full-time reaction — include final score\n• Declare winner or draw verdict with analysis",
  }[eventType] || "• Describe the match situation";

  const prompt = `You are Football Lens, a bilingual football media brand on X.

LIVE: ${match.homeFull} vs ${match.awayFull}
COMPETITION: ${comp}
SCORE: ${score}
EVENT: ${eventType}${match.stage?`\nSTAGE: ${match.stage}`:""}

Write an instant live reaction post:
${instructions}
- EN: max 240 chars, 2-3 emojis, team hashtags
- AR: max 240 chars — passionate Arab commentator voice, NOT a translation
- Both versions MUST include the score

Respond ONLY with JSON: {"en":"...","ar":"..."}`;

  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:400, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    const raw  = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
    return JSON.parse(raw);
  } catch { return null; }
}

async function logAndPost(post, match, eventType) {
  if (!APPS_SCRIPT_URL||!post) return null;
  const now    = new Date();
  const status = (eventType==="FULL_TIME"||eventType==="HALF_TIME") ? "Approved" : "Pending";
  try {
    const res  = await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"Posts Log",
        row:[ now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"),
          "Match Update", eventType, post.en, post.ar,
          "football-data.org", "", 95, "NO", "BOTH", status,
          "","","","","","","","", ],
      }),
    });
    const data = await res.json();
    const rowIndex = data.rowIndex||null;
    if (rowIndex&&status==="Approved"&&DASHBOARD_URL) {
      await fetch(`${DASHBOARD_URL}/api/post`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ textEN:post.en, textAR:post.ar, rowIndex, account:"BOTH", sourceName:"football-data.org" }),
      }).catch(()=>{});
    }
    return rowIndex;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  if (req.method==="OPTIONS") return res.status(200).end();
  if (!FOOTBALL_API_KEY) return res.status(500).json({ error:"FOOTBALL_DATA_API_KEY not set" });

  const results = { liveMatches:0, finishedMatches:0, eventsDetected:0, postsCreated:0, errors:[] };

  try {
    const [liveMatches, finishedMatches, postedEvents] = await Promise.all([
      fetchLive(), fetchFinished(), getPostedEvents(),
    ]);
    results.liveMatches     = liveMatches.length;
    results.finishedMatches = finishedMatches.length;

    for (const match of liveMatches) {
      const events = [];
      const koKey  = `${match.id}_KO`;
      if (!postedEvents.has(koKey)) events.push({ key:koKey, type:"KICK_OFF" });

      const scoreKey = `${match.id}_${match.homeScore}-${match.awayScore}`;
      if (!postedEvents.has(scoreKey)&&(match.homeScore>0||match.awayScore>0))
        events.push({ key:scoreKey, type:"GOAL" });

      if (match.status==="PAUSED") {
        const htKey = `${match.id}_HT`;
        if (!postedEvents.has(htKey)) events.push({ key:htKey, type:"HALF_TIME" });
      }

      results.eventsDetected += events.length;
      for (const ev of events) {
        try {
          const post = await generateLivePost(match, ev.type);
          await logAndPost(post, match, ev.type);
          await markPosted(ev.key);
          results.postsCreated++;
        } catch(e) { results.errors.push(`${match.home}v${match.away}: ${e.message}`); }
      }
    }

    for (const match of finishedMatches) {
      const ftKey = `${match.id}_FT`;
      if (!postedEvents.has(ftKey)) {
        try {
          const post = await generateLivePost(match, "FULL_TIME");
          await logAndPost(post, match, "FULL_TIME");
          await markPosted(ftKey);
          results.postsCreated++;
          results.eventsDetected++;
        } catch(e) { results.errors.push(`FT ${match.home}v${match.away}: ${e.message}`); }
      }
    }

    return res.status(200).json({ success:true, ...results });
  } catch(e) { return res.status(500).json({ error:e.message }); }
};
