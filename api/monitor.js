export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const TAVILY_KEY = process.env.TAVILY_API_KEY;
  const FOOTBALL_KEY = process.env.FOOTBALL_DATA_API_KEY;

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic API key not configured' });

  try {
    const { sources = [] } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();

    let context = [];
    let contentStrategy = "evergreen";

    // ── STEP 1: Check for live/today matches ──────────────────────────────────
    let liveMatches = [];
    let todayMatches = [];
    if (FOOTBALL_KEY) {
      try {
        const competitions = [2021, 2014, 2019, 2002, 2015, 2001];
        for (const compId of competitions) {
          const r = await fetch(`https://api.football-data.org/v4/competitions/${compId}/matches?dateFrom=${today}&dateTo=${today}`, { headers: { 'X-Auth-Token': FOOTBALL_KEY } });
          if (r.ok) {
            const d = await r.json();
            if (d.matches) {
              liveMatches.push(...d.matches.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED'));
              todayMatches.push(...d.matches.filter(m => m.status === 'TIMED' || m.status === 'SCHEDULED'));
            }
          }
        }
      } catch (e) { console.error('Football API error:', e.message); }
    }

    if (liveMatches.length > 0) {
      contentStrategy = "live_match";
      context.push(`LIVE MATCHES NOW:\n${liveMatches.map(m => `${m.homeTeam.shortName || m.homeTeam.name} vs ${m.awayTeam.shortName || m.awayTeam.name} | Score: ${m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? '?'}-${m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? '?'} | ${m.competition?.name}`).join('\n')}`);
    } else if (todayMatches.length > 0 && currentHour < 14) {
      contentStrategy = "match_preview";
      context.push(`TODAY'S UPCOMING MATCHES:\n${todayMatches.slice(0, 5).map(m => `${m.homeTeam.shortName || m.homeTeam.name} vs ${m.awayTeam.shortName || m.awayTeam.name} | ${m.competition?.name} | ${new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`).join('\n')}`);
    }

    // ── STEP 2: Search for latest news via Tavily ─────────────────────────────
    let newsContext = "";
    if (TAVILY_KEY) {
      try {
        const searchQueries = [
          "football transfer news today",
          "premier league latest news",
          "champions league news today",
        ];
        for (const query of searchQueries.slice(0, 2)) {
          const r = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: TAVILY_KEY, query, search_depth: "basic", max_results: 3, include_answer: false })
          });
          if (r.ok) {
            const d = await r.json();
            if (d.results) {
              newsContext += d.results.map(r => `SOURCE: ${r.url}\nHEADLINE: ${r.title}\nSUMMARY: ${r.content?.slice(0, 200)}`).join('\n\n');
            }
          }
        }
        if (newsContext) {
          context.push(`LATEST FOOTBALL NEWS:\n${newsContext}`);
          if (contentStrategy === "evergreen") contentStrategy = "news";
        }
      } catch (e) { console.error('Tavily error:', e.message); }
    }

    // ── STEP 3: Decide content strategy & build prompt ────────────────────────
    const contextText = context.join('\n\n---\n\n');

    const strategyPrompts = {
      live_match: `You are Football Lens AI. Based on these LIVE matches, generate 3 social media posts: a goal/event reaction, a live commentary, and a fan engagement post.`,
      match_preview: `You are Football Lens AI. Based on today's upcoming matches, generate 3 posts: a "today's matches" overview, a match preview for the biggest game, and a prediction poll post.`,
      news: `You are Football Lens AI. Based on the latest news, generate 3 posts covering the most important stories. Cite the source in each post.`,
      evergreen: `You are Football Lens AI. No major news or matches right now. Generate 3 evergreen posts: one historical football story, one funny/entertaining football fact, one inspirational player story.`,
    };

    const systemPrompt = `${strategyPrompts[contentStrategy] || strategyPrompts.evergreen}

CONTEXT:
${contextText || "Generate evergreen content about football history, funny moments, or inspirational stories."}

RULES:
- Generate exactly 3 posts
- Each post must have both English (EN) and Arabic (AR) versions
- Max 280 characters each
- Use relevant emojis and hashtags
- Cite sources when available
- Arabic must be natural, fluent, not translated literally

Respond ONLY with valid JSON array (no markdown):
[
  {"en":"...","ar":"...","type":"Breaking News 🔴","tone":"Breaking","credibility":90,"visualRecommended":true,"source":"source name if applicable"},
  {"en":"...","ar":"...","type":"Transfer Rumours 🔄","tone":"Transfer","credibility":85,"visualRecommended":false,"source":""},
  {"en":"...","ar":"...","type":"History & Stories 📜","tone":"Nostalgic","credibility":95,"visualRecommended":true,"source":""}
]`;

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: systemPrompt }] })
    });

    const aiData = await aiResponse.json();
    if (aiData.error) throw new Error(aiData.error.message);

    const aiText = aiData.content?.map(i => i.text || '').join('') || '';
    const posts = JSON.parse(aiText.replace(/```json|```/g, '').trim());

    return res.status(200).json({
      posts,
      strategy: contentStrategy,
      liveMatchCount: liveMatches.length,
      todayMatchCount: todayMatches.length,
      hasNews: !!newsContext,
      generatedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Monitor error:', error);
    return res.status(500).json({ error: error.message, posts: [] });
  }
}
