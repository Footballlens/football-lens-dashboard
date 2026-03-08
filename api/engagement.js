// api/engagement.js — Football Lens Performance Intelligence Engine
// Triggered daily at 3am UTC (6am Gulf) via cron-job.org
// Pulls X metrics → AI analysis → updates Strategy Brain → notifies dashboard

const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
const X_EN_BEARER     = process.env.X_EN_BEARER_TOKEN;
const X_AR_BEARER     = process.env.X_AR_BEARER_TOKEN;

// ── FETCH X METRICS FOR RECENT TWEETS ────────────────────────────────────────
async function fetchXMetrics(bearerToken, accountLabel) {
  if (!bearerToken) return [];
  try {
    // Get user ID first
    const userRes  = await fetch("https://api.twitter.com/2/users/me?user.fields=public_metrics", {
      headers: { "Authorization": `Bearer ${bearerToken}` },
    });
    const userData = await userRes.json();
    if (!userData.data) return [];
    const userId = userData.data.id;

    // Get recent tweets with metrics
    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=50&tweet.fields=public_metrics,created_at,text&exclude=retweets,replies`,
      { headers: { "Authorization": `Bearer ${bearerToken}` } }
    );
    const tweetsData = await tweetsRes.json();
    if (!tweetsData.data) return [];

    return tweetsData.data.map(t => ({
      id: t.id,
      text: t.text,
      createdAt: t.created_at,
      account: accountLabel,
      likes: t.public_metrics?.like_count || 0,
      retweets: t.public_metrics?.retweet_count || 0,
      replies: t.public_metrics?.reply_count || 0,
      impressions: t.public_metrics?.impression_count || 0,
      quotes: t.public_metrics?.quote_count || 0,
    }));
  } catch { return []; }
}

// ── LOAD POSTS FROM SHEET ─────────────────────────────────────────────────────
async function loadPostsFromSheet() {
  if (!APPS_SCRIPT_URL) return [];
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=Posts%20Log&range=A1:T500`);
    const data = await res.json();
    return (data.data||[]).filter(r => r[4]); // has EN content
  } catch { return []; }
}

// ── SAVE METRICS TO SHEET ─────────────────────────────────────────────────────
async function saveMetrics(metrics) {
  if (!APPS_SCRIPT_URL || !metrics.length) return;
  const rows = metrics.map(m => [
    m.account, m.id, m.text?.slice(0,100),
    m.impressions, m.likes, m.retweets, m.replies, m.quotes,
    new Date().toLocaleDateString("en-GB"),
  ]);
  try {
    for (const row of rows) {
      await fetch(APPS_SCRIPT_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"append", sheet:"Performance Log", row }),
      });
    }
  } catch {}
}

// ── AI STRATEGY ANALYSIS ───────────────────────────────────────────────────────
async function analyseAndUpdateStrategy(metrics, sheetPosts) {
  if (!ANTHROPIC_KEY || !metrics.length) return null;

  // Sort by engagement
  const sorted = [...metrics].sort((a,b) =>
    (b.likes + b.retweets*2 + b.impressions/100) - (a.likes + a.retweets*2 + a.impressions/100)
  );

  const top10    = sorted.slice(0,10);
  const bottom10 = sorted.slice(-10);

  const topSummary = top10.map(t =>
    `- "${t.text?.slice(0,80)}..." → ${t.likes} likes, ${t.retweets} RT, ${t.impressions} impressions`
  ).join("\n");

  const bottomSummary = bottom10.map(t =>
    `- "${t.text?.slice(0,80)}..." → ${t.likes} likes, ${t.retweets} RT, ${t.impressions} impressions`
  ).join("\n");

  const totalPosts  = metrics.length;
  const avgLikes    = Math.round(metrics.reduce((s,m)=>s+m.likes,0)/totalPosts);
  const avgRT       = Math.round(metrics.reduce((s,m)=>s+m.retweets,0)/totalPosts);
  const avgImpress  = Math.round(metrics.reduce((s,m)=>s+m.impressions,0)/totalPosts);

  const prompt = `You are the Football Lens growth strategist. Analyse X account performance and update the content strategy.

ACCOUNT STATS (last 50 posts):
- Total posts analysed: ${totalPosts}
- Average likes: ${avgLikes}
- Average retweets: ${avgRT}  
- Average impressions: ${avgImpress}

TOP PERFORMING POSTS:
${topSummary}

LOWEST PERFORMING POSTS:
${bottomSummary}

Analyse patterns and provide an updated strategy. Look for:
1. Which TONE performs best? (breaking/transfer/funny/analytical/story)
2. Which CLUBS/TEAMS get most engagement?
3. Which LEAGUES drive most interaction?
4. Best posting PATTERNS from the content?
5. What to INCREASE vs DECREASE?

Respond ONLY with valid JSON (no markdown):
{
  "preferred_tone": "most effective tone(s) comma separated",
  "top_clubs": "top 5 clubs that drive engagement comma separated",
  "top_leagues": "top 3 leagues comma separated",
  "increase": "what to post more of",
  "decrease": "what to post less of",
  "posting_advice": "1-2 sentence advice for next 7 days",
  "avg_likes": ${avgLikes},
  "avg_retweets": ${avgRT},
  "avg_impressions": ${avgImpress},
  "analysis_date": "${new Date().toLocaleDateString("en-GB")}",
  "trend": "improving/stable/declining based on top vs bottom comparison"
}`;

  const res  = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json","x-api-key":ANTHROPIC_KEY,"anthropic-version":"2023-06-01"},
    body: JSON.stringify({ model:"claude-haiku-4-5-20251001", max_tokens:600, messages:[{role:"user",content:prompt}] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const raw      = (data.content||[]).map(c=>c.text||"").join("").replace(/```json|```/g,"").trim();
  const strategy = JSON.parse(raw);
  return strategy;
}

// ── SAVE STRATEGY TO SHEET ────────────────────────────────────────────────────
async function saveStrategy(strategy) {
  if (!APPS_SCRIPT_URL || !strategy) return;
  // Write key-value pairs to Strategy Brain sheet
  const rows = Object.entries(strategy).map(([k,v]) => [k, String(v)]);
  try {
    // Clear and rewrite
    await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ action:"clearAndWrite", sheet:"Strategy Brain", rows }),
    });
  } catch {
    // Fallback: append
    for (const [k,v] of Object.entries(strategy)) {
      await fetch(APPS_SCRIPT_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ action:"append", sheet:"Strategy Brain", row:[k,String(v)] }),
      }).catch(()=>{});
    }
  }
}

// ── LOG ENGAGEMENT RUN ────────────────────────────────────────────────────────
async function logEngagementRun(note) {
  if (!APPS_SCRIPT_URL) return;
  try {
    const now = new Date();
    await fetch(APPS_SCRIPT_URL, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        action:"append", sheet:"AI Dashboard",
        row:[ now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"), "engagement_analysis", 0, 0, 0, note ]
      }),
    });
  } catch {}
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  if (req.method==="OPTIONS") return res.status(200).end();

  const results = { metricsEN:0, metricsAR:0, strategyUpdated:false, errors:[] };

  try {
    // 1. Fetch metrics from both X accounts
    const [metricsEN, metricsAR] = await Promise.all([
      fetchXMetrics(X_EN_BEARER, "EN"),
      fetchXMetrics(X_AR_BEARER, "AR"),
    ]);

    results.metricsEN = metricsEN.length;
    results.metricsAR = metricsAR.length;

    const allMetrics = [...metricsEN, ...metricsAR];

    // 2. Save raw metrics to Performance Log sheet
    await saveMetrics(allMetrics);

    // 3. Load sheet posts for cross-reference
    const sheetPosts = await loadPostsFromSheet();

    // 4. AI analysis + strategy update
    if (allMetrics.length > 0) {
      const strategy = await analyseAndUpdateStrategy(allMetrics, sheetPosts);
      if (strategy) {
        await saveStrategy(strategy);
        results.strategyUpdated = true;
        results.strategy = strategy;
      }
    } else {
      // No X bearer tokens configured yet — generate strategy from sheet data only
      results.note = "No X bearer tokens configured — add X_EN_BEARER_TOKEN and X_AR_BEARER_TOKEN to Vercel env vars to enable performance tracking";
    }

    const note = `EN:${results.metricsEN} AR:${results.metricsAR} Strategy:${results.strategyUpdated?"updated":"skipped"}`;
    await logEngagementRun(note);

    return res.status(200).json({ success:true, ...results });
  } catch(e) {
    await logEngagementRun(`ERROR: ${e.message}`);
    return res.status(500).json({ error:e.message });
  }
};
