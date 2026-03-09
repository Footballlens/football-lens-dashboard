// api/standings.js — League standings + weekly standings posts
// GET /api/standings?league=2021 → returns table
// POST /api/standings → generates standings posts for all top 5

const FOOTBALL_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;
const APPS_SCRIPT_URL  = process.env.APPS_SCRIPT_URL;

const COMPS = [
  { id:2021, name:"Premier League",  ar:"الدوري الإنجليزي الممتاز", emoji:"🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { id:2014, name:"La Liga",         ar:"الدوري الإسباني",           emoji:"🇪🇸" },
  { id:2019, name:"Serie A",         ar:"الدوري الإيطالي",           emoji:"🇮🇹" },
  { id:2002, name:"Bundesliga",      ar:"الدوري الألماني",           emoji:"🇩🇪" },
  { id:2015, name:"Ligue 1",         ar:"الدوري الفرنسي",            emoji:"🇫🇷" },
  { id:2001, name:"Champions League",ar:"دوري أبطال أوروبا",         emoji:"🏆" },
];

async function fetchStandings(id) {
  if (!FOOTBALL_API_KEY) return null;
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(()=>ctrl.abort(),8000);
    const res  = await fetch(`https://api.football-data.org/v4/competitions/${id}/standings`, {
      headers:{"X-Auth-Token":FOOTBALL_API_KEY}, signal:ctrl.signal
    });
    clearTimeout(t);
    const data = await res.json();
    if (!data.standings) return null;
    const table = (data.standings.find(s=>s.type==="TOTAL")?.table||[]).slice(0,20).map(r=>({
      position:r.position, team:r.team?.shortName||r.team?.name,
      played:r.playedGames, won:r.won, draw:r.draw, lost:r.lost,
      gf:r.goalsFor, ga:r.goalsAgainst, gd:r.goalDifference, points:r.points, form:r.form||"",
    }));
    return { competition:data.competition?.name, table };
  } catch { return null; }
}

async function generateStandingsPost(standings, comp) {
  if (!ANTHROPIC_KEY||!standings) return null;
  const top5   = standings.table.slice(0,5).map(r=>`${r.position}. ${r.team} — ${r.points}pts (${r.won}W ${r.draw}D ${r.lost}L)`).join("\n");
  const bottom3= standings.table.slice(-3).map(r=>`${r.position}. ${r.team} — ${r.points}pts`).join("\n");
  const leader = standings.table[0];
  const second = standings.table[1];
  const gap    = leader.points - second.points;

  const prompt = `You are Football Lens. Write a standings update post.

${comp.name} — Top 5:
${top5}

Bottom 3:
${bottom3}

Title race: ${leader.team} lead by ${gap} point${gap!==1?"s":""} over ${second.team}

Rules:
- EN: max 240 chars, highlight title race or relegation battle, 2 emojis, league hashtag
- AR: max 240 chars, passionate Arabic football commentary — analysis not a list

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

async function logPost(post, comp) {
  if (!APPS_SCRIPT_URL) return null;
  try {
    const now = new Date();
    const res = await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"Posts Log",
        row:[ now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"),
          "Standings","STANDINGS",post.en,post.ar,
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

  if (req.method==="GET") {
    const leagueId = parseInt(req.query?.league||req.url?.split("league=")[1])||2021;
    const standings = await fetchStandings(leagueId);
    const comp = COMPS.find(c=>c.id===leagueId)||COMPS[0];
    return res.status(200).json({ success:true, ...standings, competition:comp });
  }

  if (req.method==="POST") {
    const results = [];
    for (const comp of COMPS.slice(0,5)) {
      try {
        const standings = await fetchStandings(comp.id);
        if (!standings) continue;
        const post = await generateStandingsPost(standings, comp);
        if (post) { const rowIndex=await logPost(post,comp); results.push({competition:comp.name,post,rowIndex,top3:standings.table.slice(0,3)}); }
      } catch {}
    }
    return res.status(200).json({ success:true, generated:results.length, results });
  }
};
