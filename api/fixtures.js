// api/fixtures.js — Today + Tomorrow fixtures + pre-match preview generation
// GET /api/fixtures → returns today + tomorrow matches
// POST /api/fixtures → generates pre-match posts for big upcoming matches

const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;
const APPS_SCRIPT_URL  = process.env.APPS_SCRIPT_URL;

const COMPS = [
  { id:2021, name:"Premier League",        ar:"الدوري الإنجليزي الممتاز", tier:"TOP5" },
  { id:2014, name:"La Liga",               ar:"الدوري الإسباني",          tier:"TOP5" },
  { id:2019, name:"Serie A",               ar:"الدوري الإيطالي",          tier:"TOP5" },
  { id:2002, name:"Bundesliga",            ar:"الدوري الألماني",          tier:"TOP5" },
  { id:2015, name:"Ligue 1",               ar:"الدوري الفرنسي",           tier:"TOP5" },
  { id:2001, name:"Champions League",      ar:"دوري أبطال أوروبا",        tier:"CUP"  },
  { id:2048, name:"Europa League",         ar:"الدوري الأوروبي",          tier:"CUP"  },
  { id:2000, name:"FIFA World Cup",        ar:"كأس العالم",               tier:"CUP"  },
  { id:2018, name:"European Championship", ar:"يورو",                     tier:"CUP"  },
];

async function fetchMatches(dateFrom, dateTo) {
  if (!FOOTBALL_API_KEY) return [];
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(()=>ctrl.abort(),8000);
    const res  = await fetch(
      `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&competitions=${COMPS.map(c=>c.id).join(",")}`,
      { headers:{"X-Auth-Token":FOOTBALL_API_KEY}, signal:ctrl.signal }
    );
    clearTimeout(t);
    const data = await res.json();
    return (data.matches||[]).map(m => {
      const comp = COMPS.find(c=>c.id===m.competition?.id);
      return {
        id:         m.id,
        competition:comp?.name||m.competition?.name,
        competitionAr:comp?.ar||m.competition?.name,
        tier:       comp?.tier||"OTHER",
        home:       m.homeTeam?.shortName||m.homeTeam?.name||"Home",
        away:       m.awayTeam?.shortName||m.awayTeam?.name||"Away",
        homeFull:   m.homeTeam?.name||"Home",
        awayFull:   m.awayTeam?.name||"Away",
        homeScore:  m.score?.fullTime?.home??m.score?.halfTime?.home??null,
        awayScore:  m.score?.fullTime?.away??m.score?.halfTime?.away??null,
        status:     m.status,
        minute:     m.minute||null,
        utcDate:    m.utcDate,
        stage:      m.stage||"",
      };
    });
  } catch { return []; }
}

function gulfTime(utcDate) {
  if (!utcDate) return "--:--";
  return new Date(utcDate).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Riyadh"});
}
function todayStr()    { return new Date().toISOString().split("T")[0]; }
function tomorrowStr() { const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; }

async function generatePreview(match) {
  if (!ANTHROPIC_KEY) return null;
  const prompt = `You are Football Lens, a bilingual football media brand on X.

Write a PRE-MATCH hype post:
- Match: ${match.homeFull} vs ${match.awayFull}
- Competition: ${match.competition} (${match.competitionAr})
- Kick-off: ${gulfTime(match.utcDate)} (Gulf time)
${match.stage?`- Stage: ${match.stage}`:""}

Rules:
- EN: max 240 chars, build excitement, 2 emojis, team+league hashtags, include kick-off time
- AR: max 240 chars, Gulf football fan voice — passionate hype, NOT a translation, include kick-off time

Respond ONLY with JSON: {"en":"...","ar":"..."}`;

  try {
    const res  = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
      body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:350, messages:[{role:"user",content:prompt}] }),
    });
    const data = await res.json();
    const raw  = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
    return JSON.parse(raw);
  } catch { return null; }
}

async function logPreview(post, match) {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const now = new Date();
    const res = await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"Posts Log",
        row:[ now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"),
          "Match Preview","PREVIEW",post.en,post.ar,
          "football-data.org","",92,"NO","BOTH","Pending","","","","","","","","", ],
      }),
    });
    const data = await res.json();
    return data.rowIndex||null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  if (req.method==="OPTIONS") return res.status(200).end();

  const [todayMatches, tomorrowMatches] = await Promise.all([
    fetchMatches(todayStr(), todayStr()),
    fetchMatches(tomorrowStr(), tomorrowStr()),
  ]);

  if (req.method==="POST") {
    const targets = [...todayMatches,...tomorrowMatches]
      .filter(m=>m.status==="SCHEDULED"&&(m.tier==="CUP"||m.tier==="TOP5"))
      .slice(0,3);
    const previews = [];
    for (const match of targets) {
      const post = await generatePreview(match);
      if (post) { const rowIndex=await logPreview(post,match); previews.push({match,post,rowIndex}); }
    }
    return res.status(200).json({ success:true, today:todayMatches, tomorrow:tomorrowMatches, previews });
  }

  return res.status(200).json({ success:true, today:todayMatches, tomorrow:tomorrowMatches });
};
