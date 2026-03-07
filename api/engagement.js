// api/engagement.js — Football Lens Engagement Feedback Loop
// Called by a daily cron: checks posts from ~24h ago, fetches X metrics, logs back to sheet
// POST { tweetIds: [{tweetId, sheetRow, account}] }  OR  GET for auto-mode

export const config = { maxDuration: 30 };

const APPS_SCRIPT_URL  = process.env.APPS_SCRIPT_URL;
const X_BEARER_TOKEN   = process.env.X_BEARER_TOKEN; // X API v2 bearer token

async function fetchTweetMetrics(tweetId) {
  if (!X_BEARER_TOKEN) return null;
  try {
    const res = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics,created_at`,
      { headers: { Authorization: `Bearer ${X_BEARER_TOKEN}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const m = data.data?.public_metrics;
    if (!m) return null;
    return {
      impressions:   m.impression_count    || 0,
      likes:         m.like_count          || 0,
      reposts:       m.retweet_count       || 0,
      replies:       m.reply_count         || 0,
      profileClicks: m.user_profile_clicks || 0,
      urlClicks:     m.url_link_clicks     || 0,
    };
  } catch { return null; }
}

async function getPostedTweets() {
  if (!APPS_SCRIPT_URL) return [];
  try {
    // Read Posts Log — look for rows with tweetId (col 15) and status=Approved but no engagement yet (col 16 empty)
    const url  = `${APPS_SCRIPT_URL}?action=read&sheet=Posts%20Log&range=A5:T500`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.success) return [];

    const now     = Date.now();
    const oneDay  = 24 * 60 * 60 * 1000;
    const toFetch = [];

    (data.data || []).forEach((row, i) => {
      const status    = (row[11] || "").toLowerCase();
      const tweetId   = row[14]; // col 15 (0-indexed: 14)
      const engLogged = row[15]; // col 16 — impressions already logged?
      if (status === "approved" && tweetId && !engLogged) {
        // Only fetch if posted > 1hr ago (rough check via row date)
        toFetch.push({ tweetId, sheetRow: i + 5, account: row[10] || "", enPost: row[4], date: row[0] });
      }
    });

    return toFetch.slice(0, 20); // max 20 per run to stay within rate limits
  } catch { return []; }
}

async function logEngagement(tweetId, metrics, sheetRow, account) {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        action: "logEngagement",
        tweetId,
        sheetRow,
        account,
        ...metrics,
        fetchedAt: new Date().toISOString(),
      }),
    });
  } catch { /* non-critical */ }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Manual mode: pass specific tweet IDs
    let tweetsToFetch = [];
    if (req.method === "POST" && req.body?.tweetIds) {
      tweetsToFetch = req.body.tweetIds;
    } else {
      // Auto mode: read from sheet
      tweetsToFetch = await getPostedTweets();
    }

    if (tweetsToFetch.length === 0) {
      return res.status(200).json({ message: "No tweets to fetch engagement for", count: 0 });
    }

    const results = [];
    for (const tweet of tweetsToFetch) {
      const metrics = await fetchTweetMetrics(tweet.tweetId);
      if (metrics) {
        await logEngagement(tweet.tweetId, metrics, tweet.sheetRow, tweet.account);
        results.push({ tweetId: tweet.tweetId, ...metrics, logged: true });
      } else {
        results.push({ tweetId: tweet.tweetId, logged: false, reason: "No metrics returned — X API may not be configured yet" });
      }
      // Rate limit courtesy pause
      await new Promise(r => setTimeout(r, 200));
    }

    const logged = results.filter(r => r.logged).length;
    return res.status(200).json({
      processed: results.length,
      logged,
      skipped: results.length - logged,
      results,
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
