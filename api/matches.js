export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
    if (!API_KEY) return res.status(500).json({ error: 'Football Data API key not configured' });

    const today = new Date().toISOString().split('T')[0];

    // Fetch today's matches from all major competitions
    const competitionIds = [
      2021, // Premier League
      2014, // La Liga
      2019, // Serie A
      2002, // Bundesliga
      2015, // Ligue 1
      2001, // Champions League
    ];

    const allMatches = [];

    for (const compId of competitionIds) {
      try {
        const response = await fetch(
          `https://api.football-data.org/v4/competitions/${compId}/matches?dateFrom=${today}&dateTo=${today}`,
          { headers: { 'X-Auth-Token': API_KEY } }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.matches) {
            allMatches.push(...data.matches.map(m => ({
              id: m.id,
              home: m.homeTeam.shortName || m.homeTeam.name,
              away: m.awayTeam.shortName || m.awayTeam.name,
              competition: m.competition?.name || 'Unknown',
              time: m.utcDate ? new Date(m.utcDate).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qatar' }) + ' QST' : 'TBD',
              status: m.status === 'IN_PLAY' || m.status === 'PAUSED' ? 'LIVE' :
                      m.status === 'FINISHED' ? 'FT' :
                      m.status === 'TIMED' || m.status === 'SCHEDULED' ? 'TODAY' : m.status,
              score: m.score?.fullTime ? `${m.score.fullTime.home ?? '-'} - ${m.score.fullTime.away ?? '-'}` : null,
              minute: m.minute || null,
            })));
        }
      }
    } catch (e) { /* skip failed competition */ }
    }

    // Sort: LIVE first, then by time
    allMatches.sort((a, b) => {
      if (a.status === 'LIVE' && b.status !== 'LIVE') return -1;
      if (b.status === 'LIVE' && a.status !== 'LIVE') return 1;
      return 0;
    });

    return res.status(200).json({ matches: allMatches, count: allMatches.length, date: today });

  } catch (error) {
    return res.status(500).json({ error: error.message, matches: [] });
  }
}
