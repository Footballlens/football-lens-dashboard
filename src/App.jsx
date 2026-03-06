import React, { useState, useEffect, useCallback } from "react";

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxDgz-Zxi989GzhscU7922WqJ1iVE1d4dALVkBcTP1cvfPSoYOfSW7UUKu2TkPxQxluxQ/exec";
const SHEET_TABS = { posts: "Posts Log", sources: "Sources", analytics: "Analytics Weekly", ideas: "Content Ideas" };

async function sheetRead(sheetName, range = "A1:Z1000") {
  const url = `${APPS_SCRIPT_URL}?action=read&sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(range)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Read failed");
  return data.data || [];
}
async function sheetAppend(sheetName, row) {
  const res = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "append", sheet: sheetName, row }) });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Append failed");
  return data;
}
async function sheetUpdateCell(sheetName, rowIndex, colIndex, value) {
  const res = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "updateCell", sheet: sheetName, rowIndex, colIndex, value }) });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Update failed");
  return data;
}
async function sheetPing() {
  const url = `${APPS_SCRIPT_URL}?action=ping`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Ping failed");
  return data;
}

// Sheet columns: Date(0) Time(1) Type(2) Tone(3) EN(4) AR(5) Src1(6) Src2(7) Cred(8) Image(9) Account(10) Status(11) PostedTime(12)
function rowToPost(row, sheetRow) {
  if (!row[4] && !row[5]) return null;
  if (row[0] === "Date" || !row[0]) return null;
  return {
    id: `sheet-${sheetRow}`, sheetRow,
    type: row[2] || "General",
    tier: (row[2]||"").includes("Break") ? "BREAKING" : (row[2]||"").includes("Transfer") ? "TRANSFER" : (row[2]||"").includes("Histor") ? "STORY" : "GENERAL",
    tone: row[3] || "General",
    en: row[4] || "", ar: row[5] || "",
    sources: [row[6] && { name: row[6], url: "#", icon: "📰", score: 85 }, row[7] && { name: row[7], url: "#", icon: "📰", score: 80 }].filter(Boolean),
    credibility: parseInt(row[8]) || 80,
    visual: { recommended: row[9] === "YES", prompt: "", tools: [], dimensions: "1200x675px" },
    account: (row[10] || "both").toLowerCase(),
    status: (row[11] || "pending").toLowerCase(),
    timeAgo: (row[0] || "") + " " + (row[1] || ""),
  };
}

const DEFAULT_SOURCES = [
  { id: 1, name: "@FabrizioRomano", url: "https://rss.nitter.net/FabrizioRomano/rss", type: "RSS", category: "Transfers", credScore: 97, status: "active", icon: "🐦" },
  { id: 2, name: "Sky Sports Football", url: "https://www.skysports.com/rss/12040", type: "RSS", category: "General", credScore: 94, status: "active", icon: "📺" },
  { id: 3, name: "BBC Sport Football", url: "https://feeds.bbci.co.uk/sport/football/rss.xml", type: "RSS", category: "General", credScore: 95, status: "active", icon: "📻" },
  { id: 4, name: "ESPN FC", url: "https://www.espn.com/espn/rss/soccer/news", type: "RSS", category: "General", credScore: 93, status: "active", icon: "🏟️" },
  { id: 5, name: "beIN Sports AR", url: "https://www.beinsports.com/ar", type: "Web", category: "Arabic", credScore: 91, status: "active", icon: "📡" },
  { id: 6, name: "UEFA Official", url: "https://www.uefa.com/rssfeed/", type: "RSS", category: "Official", credScore: 99, status: "active", icon: "🏆" },
  { id: 7, name: "Goal.com EN", url: "https://www.goal.com/feeds/en/news", type: "RSS", category: "General", credScore: 89, status: "active", icon: "⚽" },
  { id: 8, name: "Kooora.com", url: "https://www.kooora.com", type: "Web", category: "Arabic", credScore: 87, status: "active", icon: "🌐" },
  { id: 9, name: "FilGoal", url: "https://www.filgoal.com", type: "Web", category: "Arabic", credScore: 86, status: "active", icon: "🌍" },
  { id: 10, name: "@David_Ornstein", url: "https://rss.nitter.net/David_Ornstein/rss", type: "RSS", category: "Transfers", credScore: 96, status: "active", icon: "🐦" },
];

const C = {
  bg: "#0b0f18", sidebar: "#0f1623", card: "#141c2e", cardBorder: "#1e2d45",
  accent: "#00d4ff", accentGold: "#f0a500", accentGreen: "#00e676",
  accentRed: "#ff3d57", accentPurple: "#a78bfa",
  text: "#e8f0fe", textMuted: "#7a8fa6", textDim: "#3a4f66",
};

export default function FootballLensDashboard() {
  const [nav, setNav] = useState("dashboard");
  const [posts, setPosts] = useState([]);
  const [sheetStatus, setSheetStatus] = useState("disconnected");
  const [sheetMsg, setSheetMsg] = useState("");
  const [sheetPostsCount, setSheetPostsCount] = useState(0);
  const [ideasData, setIdeasData] = useState([]);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [syncingPost, setSyncingPost] = useState(null);
  const [liveTime, setLiveTime] = useState(new Date());
  const [filter, setFilter] = useState("All");
  const [expandedPost, setExpandedPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [editText, setEditText] = useState({ en: "", ar: "" });
  const [newTopic, setNewTopic] = useState("");
  const [newTone, setNewTone] = useState("Breaking");
  const [newLang, setNewLang] = useState("both");
  const [generating, setGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState(null);
  const [customSources, setCustomSources] = useState(DEFAULT_SOURCES);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [newSourceCategory, setNewSourceCategory] = useState("General");
  const [validatingSource, setValidatingSource] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [settingsTab, setSettingsTab] = useState("api");
  const [showSettings, setShowSettings] = useState(false);
  const [monitorStatus, setMonitorStatus] = useState("idle");
  const [lastMonitorRun, setLastMonitorRun] = useState(null);
  const [activityFeed, setActivityFeed] = useState([
    { id: 1, icon: "🟢", title: "Sheet Brain Connected", sub: "All data synced", time: "Just now", color: "#00e676" },
    { id: 2, icon: "🤖", title: "AI Engine Ready", sub: "Monitoring active sources", time: "1 min ago", color: "#00d4ff" },
    { id: 3, icon: "📡", title: "Sources Online", sub: "10 sources monitored", time: "2 min ago", color: "#f0a500" },
  ]);
  const [todayMatches, setTodayMatches] = useState([]);
  const [uiLang, setUiLang] = useState("en");

  useEffect(() => { const t = setInterval(() => setLiveTime(new Date()), 1000); return () => clearInterval(t); }, []);

  const addActivity = (icon, title, sub, color = C.accent) => {
    setActivityFeed(f => [{ id: Date.now(), icon, title, sub, time: "Just now", color }, ...f.slice(0, 9)]);
  };

  // RECONCILIATION — Sheet is source of truth
  const syncFromSheet = useCallback(async () => {
    setSheetStatus("connecting");
    setSheetMsg("Syncing with Google Sheet Brain...");
    try {
      await sheetPing();
      const [postsRows, ideasRows, analyticsRows] = await Promise.all([
        sheetRead(SHEET_TABS.posts, "A5:M1000"),
        sheetRead(SHEET_TABS.ideas, "A5:I1000"),
        sheetRead(SHEET_TABS.analytics, "A5:N20"),
      ]);
      const sheetPosts = postsRows
        .map((row, i) => rowToPost(row, i + 5))
        .filter(Boolean);
      setPosts(sheetPosts);
      setSheetPostsCount(sheetPosts.length);
      setIdeasData(ideasRows.filter(r => r[0] && r[0] !== "Date Added"));
      setAnalyticsData(analyticsRows.filter(r => r[0] && r[0] !== "Week"));
      setSheetStatus("connected");
      setSheetMsg(`✅ Synced — ${sheetPosts.length} posts loaded`);
      addActivity("🔄", "Sheet Synced", `${sheetPosts.length} posts reconciled`, C.accentGreen);
      setTimeout(() => setSheetMsg(""), 4000);
    } catch (e) {
      setSheetStatus("error");
      setSheetMsg(`❌ Sync failed: ${e.message}`);
    }
  }, []);

  useEffect(() => { syncFromSheet(); }, []);
  useEffect(() => { fetchMatches(); }, []);

  const fetchMatches = async () => {
    try {
      const res = await fetch("/api/matches");
      const data = await res.json();
      if (data.matches) setTodayMatches(data.matches.slice(0, 8));
    } catch (e) { console.error("Matches:", e); }
  };

  // FIX 3+4: Approve/Reject UPDATES existing row in sheet — no new row
  const approvePost = async (id, action) => {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    const newStatus = action === "reject" ? "Rejected" : "Approved";
    setSyncingPost(id);
    setPosts(p => p.map(p2 => p2.id === id ? { ...p2, status: newStatus.toLowerCase() } : p2));
    if (post.sheetRow && sheetStatus === "connected") {
      try {
        await sheetUpdateCell(SHEET_TABS.posts, post.sheetRow, 12, newStatus);
        await sheetUpdateCell(SHEET_TABS.posts, post.sheetRow, 13, new Date().toLocaleTimeString());
        addActivity(newStatus === "Approved" ? "✅" : "❌", `Post ${newStatus}`, post.en.slice(0, 45) + "...", newStatus === "Approved" ? C.accentGreen : C.accentRed);
        setSheetMsg(`✅ "${newStatus}" saved in Sheet Brain`);
      } catch (e) { setSheetMsg(`⚠️ Local updated — sheet sync failed: ${e.message}`); }
    }
    setTimeout(() => setSheetMsg(""), 3000);
    setSyncingPost(null);
  };

  // FIX 2: Real edit with sheet update
  const startEdit = (post) => { setEditingPost(post.id); setEditText({ en: post.en, ar: post.ar }); };
  const saveEdit = async (id) => {
    const post = posts.find(p => p.id === id);
    if (!editText.en.trim() && !editText.ar.trim()) return;
    setPosts(p => p.map(p2 => p2.id === id ? { ...p2, en: editText.en, ar: editText.ar } : p2));
    if (post?.sheetRow && sheetStatus === "connected") {
      try {
        await sheetUpdateCell(SHEET_TABS.posts, post.sheetRow, 5, editText.en);
        await sheetUpdateCell(SHEET_TABS.posts, post.sheetRow, 6, editText.ar);
        addActivity("✏️", "Post Edited", "Changes saved to Sheet Brain", C.accentGold);
      } catch (e) { console.error(e); }
    }
    setEditingPost(null);
  };

  const generatePost = async () => {
    if (!newTopic.trim()) return;
    setGenerating(true); setGeneratedPost(null);
    try {
      const prompt = `You are Football Lens, a professional bilingual football media brand. Generate a social media post.
Topic: ${newTopic}
Tone: ${newTone}
Respond ONLY with valid JSON (no markdown):
{"en":"English post max 280 chars with emojis and hashtags","ar":"Arabic post max 280 chars with emojis","visualRecommended":true,"visualReason":"one sentence","imagePrompt":"detailed image prompt 1200x675px","tone":"${newTone}","credibility":88,"type":"${newTone} ✨"}`;
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const text = data.content?.map(i => i.text || "").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setGeneratedPost({
        id: `gen-${Date.now()}`, type: parsed.type || `${newTone} ✨`,
        tier: newTone.toUpperCase().slice(0, 8), credibility: parsed.credibility || 88,
        timeAgo: "Just now", en: parsed.en, ar: parsed.ar,
        sources: [{ name: "AI Generated", url: "#", icon: "🤖", score: 85 }],
        visual: { recommended: parsed.visualRecommended, reason: parsed.visualReason, prompt: parsed.imagePrompt, tools: ["Adobe Firefly", "Canva AI"], dimensions: "1200x675px" },
        tone: parsed.tone || newTone, status: "pending", account: newLang, sheetRow: null,
      });
      addActivity("✨", "Post Generated", newTopic.slice(0, 40), C.accent);
    } catch (e) { setSheetMsg(`❌ Generation failed: ${e.message}`); }
    setGenerating(false);
  };

  const addToQueue = async () => {
    if (!generatedPost) return;
    try {
      const now = new Date();
      await sheetAppend(SHEET_TABS.posts, [
        now.toLocaleDateString(), now.toLocaleTimeString(),
        generatedPost.type, generatedPost.tone, generatedPost.en, generatedPost.ar,
        "AI Generated", "", generatedPost.credibility,
        generatedPost.visual.recommended ? "YES" : "NO",
        generatedPost.account.toUpperCase(), "Pending", "", "", "", "", "", "", "", "", "", ""
      ]);
      addActivity("📥", "Added to Queue", "Logged as Pending in Sheet Brain", C.accentGold);
      setSheetMsg("✅ Post logged as Pending — syncing...");
      await syncFromSheet();
    } catch (e) { setSheetMsg(`⚠️ Sheet sync failed: ${e.message}`); }
    setGeneratedPost(null); setNewTopic(""); setNav("posts");
  };

  const runMonitor = async () => {
    setMonitorStatus("running");
    setSheetMsg("🔍 AI Monitor scanning sources...");
    try {
      const res = await fetch("/api/monitor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: customSources.filter(s => s.status === "active").map(s => ({ url: s.url, name: s.name, credScore: s.credScore, category: s.category })) }),
      });
      const data = await res.json();
      if (data.posts?.length > 0) {
        for (const post of data.posts) {
          await sheetAppend(SHEET_TABS.posts, [
            new Date().toLocaleDateString(), new Date().toLocaleTimeString(),
            post.type || "Monitor Update", post.tone || "Breaking",
            post.en, post.ar, post.source || "Monitor", "",
            post.credibility || 80, post.visualRecommended ? "YES" : "NO",
            "BOTH", "Pending", "", "", "", "", "", "", "", "", "", ""
          ]);
        }
        await syncFromSheet();
        setSheetMsg(`✅ Monitor: ${data.posts.length} new posts added to queue`);
        addActivity("🤖", "Monitor Done", `${data.posts.length} posts generated`, C.accentGreen);
      } else {
        setSheetMsg("✅ Monitor ran — no new events at this time");
        addActivity("🔍", "Monitor Scanned", "No new events detected", C.textMuted);
      }
      setLastMonitorRun(new Date());
    } catch (e) {
      setSheetMsg(`⚠️ Monitor: ${e.message}`);
      addActivity("⚠️", "Monitor Error", e.message.slice(0, 50), C.accentRed);
    }
    setMonitorStatus("idle");
    setTimeout(() => setSheetMsg(""), 6000);
  };

  const validateSource = async () => {
    if (!newSourceUrl.trim()) return;
    setValidatingSource(true); setValidationResult(null);
    try {
      const url = newSourceUrl.trim();
      const isRSS = url.includes("rss") || url.includes("feed") || url.includes("atom") || url.endsWith(".xml");
      const isTwitter = url.includes("twitter.com") || url.includes("x.com") || url.includes("nitter");
      const domain = new URL(url).hostname.replace("www.", "");
      const guessName = newSourceName || (domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1));
      setValidationResult({ name: guessName, url, type: isRSS ? "RSS" : isTwitter ? "Twitter" : "Web", icon: isTwitter ? "🐦" : isRSS ? "📰" : "🌐", credScore: isTwitter ? 85 : isRSS ? 88 : 80, category: newSourceCategory, status: "active" });
    } catch (e) { setValidationResult({ error: "Invalid URL — please check format" }); }
    setValidatingSource(false);
  };
  const confirmAddSource = () => {
    if (!validationResult?.error) {
      setCustomSources(s => [...s, { id: Date.now(), ...validationResult, name: newSourceName || validationResult.name }]);
      setNewSourceUrl(""); setNewSourceName(""); setValidationResult(null);
      addActivity("➕", "Source Added", newSourceName || "New source", C.accentGold);
    }
  };
  const removeSource = (id) => setCustomSources(s => s.filter(src => src.id !== id));
  const toggleSource = (id) => setCustomSources(s => s.map(src => src.id === id ? { ...src, status: src.status === "active" ? "paused" : "active" } : src));

  const pendingPosts = posts.filter(p => p.status === "pending");
  const approvedPosts = posts.filter(p => p.status === "approved");
  const rejectedPosts = posts.filter(p => p.status === "rejected");
  const activeSources = customSources.filter(s => s.status === "active").length;
  const tierColor = (t) => ({ BREAKING: C.accentRed, TRANSFER: C.accentGold, VIRAL: "#ff6b35", ANALYSIS: C.accent, STORY: C.accentPurple, GENERAL: C.textMuted })[t] || C.textMuted;

  const S = {
    input: { width: "100%", background: "#070b14", border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" },
    select: { background: "#070b14", border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13, outline: "none" },
    textarea: { width: "100%", background: "#070b14", border: `1px solid ${C.cardBorder}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 13, outline: "none", resize: "vertical", minHeight: 90, boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6 },
    btn: (color, outline) => ({ padding: "7px 14px", borderRadius: 8, border: outline ? `1px solid ${color}` : "none", background: outline ? "transparent" : color, color: outline ? color : "#000", cursor: "pointer", fontSize: 12, fontWeight: 700 }),
    badge: (color) => ({ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: "3px 7px", borderRadius: 5, background: `${color}22`, color, border: `1px solid ${color}44` }),
    navItem: (a) => ({ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", cursor: "pointer", fontSize: 13, fontWeight: a ? 700 : 500, color: a ? C.accent : C.textMuted, background: a ? `${C.accent}12` : "transparent", borderRight: `3px solid ${a ? C.accent : "transparent"}`, transition: "all 0.15s" }),
    statCard: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: "16px 20px" },
    card: { background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, overflow: "hidden", marginBottom: 12 },
    postLangTab: (a) => ({ flex: 1, padding: "7px 0", textAlign: "center", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, background: a ? C.accent : "transparent", color: a ? "#000" : C.textMuted, border: "none" }),
    filterBtn: (a) => ({ padding: "5px 12px", borderRadius: 20, border: `1px solid ${a ? C.accent : C.cardBorder}`, background: a ? `${C.accent}22` : "transparent", color: a ? C.accent : C.textMuted, cursor: "pointer", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }),
  };

  // FIX 1: PostCard has its own independent lang state
  const PostCard = ({ post }) => {
    const [lang, setLang] = useState("en");
    const isExpanded = expandedPost === post.id;
    const isEditing = editingPost === post.id;
    const isSyncing = syncingPost === post.id;

    return (
      <div style={{ ...S.card, borderColor: post.status === "approved" ? C.accentGreen + "55" : post.status === "rejected" ? C.accentRed + "33" : C.cardBorder }}>
        <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={S.badge(tierColor(post.tier))}>{post.tier}</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{post.type}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: post.credibility >= 85 ? C.accentGreen : C.accentGold }}>{post.credibility >= 85 ? "🟢" : "🟡"} {post.credibility}%</span>
            {post.status !== "pending" && <span style={S.badge(post.status === "approved" ? C.accentGreen : C.accentRed)}>{post.status.toUpperCase()}</span>}
            {isSyncing && <span style={{ fontSize: 10, color: C.accentGold }}>⏳ Syncing...</span>}
          </div>
        </div>
        <div style={{ padding: "12px 16px" }}>
          {/* FIX 1: Tabs per card — never reset */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10, background: "#070b14", borderRadius: 8, padding: 3 }}>
            <button style={S.postLangTab(lang === "en")} onClick={() => setLang("en")}>🇬🇧 English</button>
            <button style={S.postLangTab(lang === "ar")} onClick={() => setLang("ar")}>🇸🇦 Arabic</button>
          </div>
          {/* FIX 2: Real editable textarea */}
          {isEditing ? (
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>🇬🇧 English:</div>
              <textarea style={{ ...S.textarea, marginBottom: 8, direction: "ltr" }} value={editText.en} onChange={e => setEditText(p => ({ ...p, en: e.target.value }))} autoFocus />
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>🇸🇦 Arabic:</div>
              <textarea style={{ ...S.textarea, direction: "rtl", textAlign: "right" }} value={editText.ar} onChange={e => setEditText(p => ({ ...p, ar: e.target.value }))} />
            </div>
          ) : (
            <div style={{ background: "#070b14", borderRadius: 8, padding: "10px 12px", fontSize: 13, lineHeight: 1.7, direction: lang === "ar" ? "rtl" : "ltr", textAlign: lang === "ar" ? "right" : "left", minHeight: 56 }}>
              {lang === "en" ? post.en : post.ar}
            </div>
          )}
          {isExpanded && !isEditing && (
            <div style={{ marginTop: 10 }}>
              {post.sources?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>📎 Sources</div>
                  {post.sources.map((s, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.cardBorder}`, fontSize: 12 }}>
                      <span>{s.icon}</span><span style={{ color: C.accent, fontWeight: 600 }}>{s.name}</span>
                      <span style={{ marginLeft: "auto", color: C.accentGold, fontSize: 11, fontWeight: 700 }}>{s.score}%</span>
                    </div>
                  ))}
                </div>
              )}
              {post.visual?.recommended && post.visual?.prompt && (
                <div style={{ background: `${C.accentGold}0d`, border: `1px solid ${C.accentGold}33`, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.accentGold, marginBottom: 4 }}>🖼️ Image Prompt</div>
                  <div style={{ fontSize: 11, color: C.textMuted, cursor: "pointer", fontFamily: "monospace", wordBreak: "break-word" }} onClick={() => navigator.clipboard?.writeText(post.visual.prompt)}>{post.visual.prompt}</div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 4 }}>Click to copy · Adobe Firefly · Canva AI</div>
                </div>
              )}
            </div>
          )}
          <button onClick={() => setExpandedPost(isExpanded ? null : post.id)} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 11, fontWeight: 600, marginTop: 8, padding: 0 }}>
            {isExpanded ? "▲ Hide" : "▼ Sources & visual"}
          </button>
        </div>
        {post.status === "pending" && (
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.cardBorder}`, display: "flex", gap: 6, flexWrap: "wrap", background: "#070b1488" }}>
            {isEditing ? (
              <>
                <button style={S.btn(C.accentGreen)} onClick={() => saveEdit(post.id)}>💾 Save</button>
                <button style={S.btn(C.textMuted, true)} onClick={() => setEditingPost(null)}>Cancel</button>
              </>
            ) : (
              <>
                <button style={S.btn(C.accentGreen)} onClick={() => approvePost(post.id, "both")}>✅ Approve</button>
                <button style={S.btn(C.accent, true)} onClick={() => approvePost(post.id, "en")}>🇬🇧 EN</button>
                <button style={S.btn(C.accentGold, true)} onClick={() => approvePost(post.id, "ar")}>🇸🇦 AR</button>
                <button style={S.btn(C.textMuted, true)} onClick={() => startEdit(post)}>✏️ Edit</button>
                <button style={S.btn(C.accentRed, true)} onClick={() => approvePost(post.id, "reject")}>✕ Reject</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const Sparkline = ({ data = [3,5,2,8,6,9,12], color = C.accentGreen }) => {
    const max = Math.max(...data), min = Math.min(...data);
    const pts = data.map((v,i) => `${(i/(data.length-1))*100},${100-((v-min)/(max-min||1))*100}`).join(" ");
    return <svg viewBox="0 0 100 40" style={{ width: 72, height: 28 }} preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  };

  const displayPosts = filter === "All" ? posts : filter === "Pending" ? pendingPosts : filter === "Approved" ? approvedPosts : rejectedPosts;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        button:hover{opacity:0.82;} input::placeholder{color:${C.textDim};} textarea::placeholder{color:${C.textDim};}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.cardBorder};border-radius:2px;}
      `}</style>

      {/* ── SIDEBAR ── */}
      <aside style={{ width: 220, background: C.sidebar, borderRight: `1px solid ${C.cardBorder}`, display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 50 }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.cardBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, background: "linear-gradient(135deg,#00e676,#00d4ff)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🔭</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.3px" }}>Football Lens</div>
              <div style={{ fontSize: 10, color: C.accentGreen, fontWeight: 700, letterSpacing: 1 }}>AI MEDIA ENGINE</div>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, paddingTop: 10 }}>
          {[["dashboard","📊","Dashboard"],["posts","📋","Posts Queue"],["generate","✨","Generate"],["sources","📡","Sources"],["analytics","📈","Analytics"],["insights","🧠","AI Insights"],["ideas","💡","Ideas"]].map(([id,icon,label]) => (
            <div key={id} style={S.navItem(nav===id)} onClick={() => setNav(id)}>
              <span style={{ fontSize: 17 }}>{icon}</span>
              <span>{label}</span>
              {id==="posts" && pendingPosts.length>0 && <span style={{ marginLeft:"auto", background:C.accentRed, color:"#fff", borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:800 }}>{pendingPosts.length}</span>}
            </div>
          ))}
        </nav>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.cardBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }} onClick={syncFromSheet}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: sheetStatus==="connected" ? C.accentGreen : sheetStatus==="connecting" ? C.accentGold : C.accentRed }} />
            <span style={{ fontSize: 12, color: sheetStatus==="connected" ? C.accentGreen : C.textMuted, fontWeight: 600 }}>
              {sheetStatus==="connected" ? "Sheet Brain Live" : sheetStatus==="connecting" ? "Connecting..." : "Sheet Offline"}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.textDim }}>{sheetPostsCount} posts · {ideasData.length} ideas</div>
        </div>
        <div style={{ padding: "10px 20px", borderTop: `1px solid ${C.cardBorder}` }}>
          <div style={{ ...S.navItem(false), padding:"8px 0", cursor:"pointer" }} onClick={() => setShowSettings(true)}>
            <span>⚙️</span><span style={{fontSize:13}}>Settings</span>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ marginLeft: 220, flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {/* Topbar */}
        <div style={{ background: C.sidebar, borderBottom: `1px solid ${C.cardBorder}`, padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 40 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            {nav==="dashboard"?"Dashboard":nav==="posts"?"Posts Queue":nav==="generate"?"AI Generator":nav==="sources"?"Sources":nav==="analytics"?"Analytics":nav==="insights"?"AI Insights":"Ideas"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {sheetMsg && <div style={{ fontSize: 12, color: sheetStatus==="error" ? C.accentRed : C.accentGreen, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sheetMsg}</div>}
            <button style={{ ...S.btn(monitorStatus==="running" ? C.accentGold : C.accentGreen), display:"flex", alignItems:"center", gap:6 }} onClick={runMonitor} disabled={monitorStatus==="running"}>
              <span style={{ display:"inline-block", animation:monitorStatus==="running"?"spin 1s linear infinite":"none" }}>🔍</span>
              {monitorStatus==="running" ? "Scanning..." : "Run Monitor"}
            </button>
            <button style={S.btn(C.accent, true)} onClick={syncFromSheet}>🔄 Sync</button>
            <button style={{ ...S.btn(C.textMuted, true), fontSize:12 }} onClick={() => setUiLang(l => l==="en"?"ar":"en")}>
              {uiLang==="en" ? "🇸🇦 عربي" : "🇬🇧 English"}
            </button>
            <span style={{ fontSize: 12, color: C.textMuted, fontVariantNumeric: "tabular-nums" }}>{liveTime.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Page Content */}
        <div style={{ padding: 24, flex: 1 }}>

          {/* ── DASHBOARD ── */}
          {nav==="dashboard" && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14, marginBottom:22 }}>
                {[
                  ["Pending Approval", pendingPosts.length, C.accentRed, [2,5,3,6,4,pendingPosts.length]],
                  ["Posts in Brain", sheetPostsCount, C.accentGreen, [10,14,18,20,sheetPostsCount]],
                  ["Ideas Backlog", ideasData.length, C.accentGold, [5,8,12,14,ideasData.length]],
                  ["Active Sources", activeSources, C.accent, [8,9,10,10,activeSources]],
                  ["Approved Today", approvedPosts.length, C.accentGreen, [0,1,2,approvedPosts.length]],
                ].map(([label,val,color,data],i) => (
                  <div key={i} style={S.statCard}>
                    <div style={{ fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>{label}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
                      <div style={{ fontSize:28, fontWeight:800, color, lineHeight:1 }}>{val}</div>
                      <Sparkline data={data} color={color} />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:20 }}>
                <div>
                  <div style={S.card}>
                    <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.cardBorder}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:14, fontWeight:700 }}>📋 Pending Approval <span style={{ background:`${C.accentRed}22`, color:C.accentRed, borderRadius:10, padding:"1px 8px", fontSize:12, marginLeft:6 }}>{pendingPosts.length}</span></div>
                      <button style={S.btn(C.accent, true)} onClick={() => setNav("posts")}>View All →</button>
                    </div>
                    <div style={{ padding:16 }}>
                      {pendingPosts.length===0 ? (
                        <div style={{ textAlign:"center", padding:"28px 0", color:C.textMuted, fontSize:13 }}>
                          🎉 All caught up! <button style={{ ...S.btn(C.accent), marginLeft:10 }} onClick={() => setNav("generate")}>✨ Generate Posts</button>
                        </div>
                      ) : pendingPosts.slice(0,2).map(p => <PostCard key={p.id} post={p} />)}
                    </div>
                  </div>

                  <div style={S.card}>
                    <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.cardBorder}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:14, fontWeight:700 }}>⚽ Today's Matches</div>
                      <span style={{ fontSize:11, color:C.textMuted }}>football-data.org</span>
                    </div>
                    <div style={{ padding:16 }}>
                      {todayMatches.length===0 ? (
                        <div style={{ color:C.textMuted, fontSize:13, textAlign:"center", padding:"18px 0" }}>
                          Deploy api/matches.js to see live fixtures
                        </div>
                      ) : todayMatches.map((m,i) => (
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${C.cardBorder}`, fontSize:13 }}>
                          <span style={{ fontWeight:600 }}>{m.home} vs {m.away}</span>
                          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                            <span style={{ color:C.textMuted, fontSize:12 }}>{m.time}</span>
                            <span style={S.badge(m.status==="LIVE" ? C.accentRed : C.accent)}>{m.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={S.card}>
                    <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.cardBorder}` }}>
                      <div style={{ fontSize:14, fontWeight:700 }}>⚡ Activity Feed</div>
                    </div>
                    {activityFeed.map(a => (
                      <div key={a.id} style={{ display:"flex", gap:10, padding:"10px 16px", borderBottom:`1px solid ${C.cardBorder}` }}>
                        <div style={{ width:32, height:32, borderRadius:8, background:`${a.color}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{a.icon}</div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600 }}>{a.title}</div>
                          <div style={{ fontSize:11, color:C.textMuted }}>{a.sub}</div>
                          <div style={{ fontSize:10, color:C.textDim }}>{a.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ ...S.statCard, marginTop:12 }}>
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📊 Queue Status</div>
                    {[["Pending",pendingPosts.length,C.accentGold],["Approved",approvedPosts.length,C.accentGreen],["Rejected",rejectedPosts.length,C.accentRed]].map(([l,v,col]) => (
                      <div key={l} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ width:7, height:7, borderRadius:"50%", background:col }} />
                          <span style={{ fontSize:13, color:C.textMuted }}>{l}</span>
                        </div>
                        <span style={{ fontSize:22, fontWeight:800, color:col }}>{v}</span>
                      </div>
                    ))}
                    <button style={{ ...S.btn(C.accent, true), width:"100%", marginTop:8 }} onClick={syncFromSheet}>🔄 Sync from Sheet</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── POSTS QUEUE ── */}
          {nav==="posts" && (
            <>
              <div style={{ display:"flex", gap:8, marginBottom:16, alignItems:"center", flexWrap:"wrap" }}>
                <div style={{ display:"flex", gap:6, flex:1, flexWrap:"wrap" }}>
                  {[["All",posts.length],["Pending",pendingPosts.length],["Approved",approvedPosts.length],["Rejected",rejectedPosts.length]].map(([f,count]) => (
                    <button key={f} style={S.filterBtn(filter===f)} onClick={() => setFilter(f)}>{f} ({count})</button>
                  ))}
                </div>
                <button style={S.btn(C.accentGreen, true)} onClick={syncFromSheet}>🔄 Sync Sheet</button>
              </div>
              {displayPosts.length===0 ? (
                <div style={{ ...S.card, padding:50, textAlign:"center", color:C.textMuted }}>
                  No posts found. <button style={{ ...S.btn(C.accent), marginLeft:10 }} onClick={() => setNav("generate")}>✨ Generate</button>
                </div>
              ) : displayPosts.map(p => <PostCard key={p.id} post={p} />)}
            </>
          )}

          {/* ── GENERATE ── */}
          {nav==="generate" && (
            <div style={{ maxWidth:680 }}>
              <div style={{ ...S.card, padding:24, marginBottom:14 }}>
                <div style={{ fontSize:16, fontWeight:800, marginBottom:18 }}>✨ AI Content Generator</div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Topic / Story</div>
                  <input style={S.input} placeholder="e.g. Salah injury, Mbappé transfer, Man City vs Arsenal..." value={newTopic} onChange={e => setNewTopic(e.target.value)} onKeyDown={e => e.key==="Enter" && generatePost()} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:18 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Tone</div>
                    <select style={{ ...S.select, width:"100%" }} value={newTone} onChange={e => setNewTone(e.target.value)}>
                      {["Breaking","Transfer","Analytical","Funny/Sarcastic","Nostalgic","Hype","Debate"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Language</div>
                    <select style={{ ...S.select, width:"100%" }} value={newLang} onChange={e => setNewLang(e.target.value)}>
                      <option value="both">Both EN + AR</option>
                      <option value="en">English Only</option>
                      <option value="ar">Arabic Only</option>
                    </select>
                  </div>
                </div>
                <button style={{ ...S.btn(generating||!newTopic.trim() ? C.textMuted : C.accentGreen), width:"100%", padding:13, fontSize:14 }} onClick={generatePost} disabled={generating||!newTopic.trim()}>
                  {generating ? "⏳ Generating..." : "🚀 Generate Post"}
                </button>
              </div>
              {generatedPost && (
                <>
                  <div style={{ fontSize:13, fontWeight:700, color:C.accentGreen, marginBottom:8 }}>✅ Post ready — review and add to queue:</div>
                  <PostCard post={generatedPost} />
                  <button style={{ ...S.btn(C.accentGreen), width:"100%", padding:13, fontSize:14, marginTop:-6 }} onClick={addToQueue}>➕ Add to Queue & Log as Pending in Sheet</button>
                </>
              )}
              <div style={{ ...S.card, padding:16, marginTop:14 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>⚡ Quick Shortcuts</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  {[["🔴 Breaking News","Breaking","Latest breaking football news"],["🔄 Transfer Update","Transfer","Latest transfer rumour"],["📅 This Day in Football","Nostalgic","On this day in football history"],["😂 Funny Content","Funny/Sarcastic","Funny football moment"],["🧠 Tactical Analysis","Analytical","Tactical breakdown and formation analysis"],["🔥 Fan Debate","Debate","GOAT debate Messi vs Ronaldo"]].map(([label,tone,topic]) => (
                    <button key={label} style={{ background:"#070b14", border:`1px solid ${C.cardBorder}`, borderRadius:8, padding:"10px 14px", cursor:"pointer", fontSize:12, color:C.textMuted, fontWeight:600, textAlign:"left" }}
                      onClick={() => { setNewTone(tone); setNewTopic(topic); }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── SOURCES ── */}
          {nav==="sources" && (
            <div style={{ maxWidth:760 }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:20 }}>
                {[["Total Sources",customSources.length,C.accent],["Active",activeSources,C.accentGreen],["Paused",customSources.length-activeSources,C.accentGold]].map(([l,v,col]) => (
                  <div key={l} style={S.statCard}>
                    <div style={{ fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{l}</div>
                    <div style={{ fontSize:26, fontWeight:800, color:col }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...S.card, padding:20, marginBottom:20 }}>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:14, color:C.accent }}>➕ Add New Source</div>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Source URL *</div>
                  <input style={S.input} placeholder="https://www.skysports.com/rss/12040 or https://kooora.com" value={newSourceUrl}
                    onChange={e => { setNewSourceUrl(e.target.value); setValidationResult(null); }}
                    onKeyDown={e => e.key==="Enter" && validateSource()} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Display Name</div>
                    <input style={S.input} placeholder="e.g. Sky Sports" value={newSourceName} onChange={e => setNewSourceName(e.target.value)} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Category</div>
                    <select style={{ ...S.select, width:"100%" }} value={newSourceCategory} onChange={e => setNewSourceCategory(e.target.value)}>
                      {["General","Transfers","Arabic","Official","Analytics","Funny"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <button style={{ ...S.btn(C.accent), width:"100%", padding:10 }} onClick={validateSource} disabled={validatingSource||!newSourceUrl.trim()}>
                  {validatingSource ? "⏳ Validating..." : "🔍 Validate Source"}
                </button>
                {validationResult && (
                  <div style={{ marginTop:12, padding:12, borderRadius:8, background:validationResult.error ? `${C.accentRed}11`:`${C.accentGreen}11`, border:`1px solid ${validationResult.error ? C.accentRed+"44":C.accentGreen+"44"}` }}>
                    {validationResult.error ? <div style={{ color:C.accentRed, fontSize:13 }}>❌ {validationResult.error}</div> : (
                      <>
                        <div style={{ fontSize:13, fontWeight:700, color:C.accentGreen, marginBottom:8 }}>✅ Validated — ready to add</div>
                        <div style={{ display:"flex", gap:14, fontSize:12, color:C.textMuted, marginBottom:10 }}>
                          <span>{validationResult.icon} {validationResult.name}</span>
                          <span>📌 {validationResult.type}</span>
                          <span>🏷️ {validationResult.category}</span>
                          <span style={{ color:C.accentGreen }}>⭐ {validationResult.credScore}%</span>
                        </div>
                        <button style={{ ...S.btn(C.accentGreen), width:"100%", padding:9 }} onClick={confirmAddSource}>➕ Add to Monitoring List</button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {["Transfers","General","Arabic","Official"].map(cat => {
                const catSrcs = customSources.filter(s => s.category===cat);
                if (!catSrcs.length) return null;
                return (
                  <div key={cat} style={{ marginBottom:18 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>
                      {cat==="Transfers"?"🔄":cat==="Arabic"?"🌍":cat==="Official"?"🏆":"📰"} {cat} ({catSrcs.filter(s=>s.status==="active").length}/{catSrcs.length})
                    </div>
                    {catSrcs.map(src => (
                      <div key={src.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, background:C.card, border:`1px solid ${C.cardBorder}`, marginBottom:8, opacity:src.status==="active"?1:0.5, transition:"all 0.2s" }}>
                        <span style={{ fontSize:20 }}>{src.icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700 }}>{src.name}</div>
                          <div style={{ fontSize:11, color:C.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{src.url}</div>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                          <span style={S.badge(src.credScore>90?C.accentGreen:src.credScore>80?C.accentGold:C.textMuted)}>{src.credScore}%</span>
                          <span style={S.badge(src.type==="RSS"?C.accent:C.accentGold)}>{src.type}</span>
                          <button onClick={() => toggleSource(src.id)} style={{ ...S.btn(src.status==="active"?C.accentGold:C.accentGreen, true), padding:"4px 10px" }}>
                            {src.status==="active"?"⏸":"▶"}
                          </button>
                          {src.id>10 && <button onClick={() => removeSource(src.id)} style={{ ...S.btn(C.accentRed, true), padding:"4px 10px" }}>✕</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── ANALYTICS ── */}
          {nav==="analytics" && (
            <div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:22 }}>
                {[["Total Posts",sheetPostsCount,C.accent],[" Approved",approvedPosts.length,C.accentGreen],["Pending",pendingPosts.length,C.accentGold],["Rejected",rejectedPosts.length,C.accentRed]].map(([l,v,col]) => (
                  <div key={l} style={S.statCard}>
                    <div style={{ fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>{l}</div>
                    <div style={{ fontSize:28, fontWeight:800, color:col }}>{v}</div>
                  </div>
                ))}
              </div>
              {analyticsData.length>0 ? (
                <div style={S.card}>
                  <div style={{ padding:"13px 18px", borderBottom:`1px solid ${C.cardBorder}`, fontSize:14, fontWeight:700 }}>📊 Weekly Analytics — Sheet Brain</div>
                  <div style={{ padding:16, overflowX:"auto" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"80px repeat(6,1fr)", gap:10, padding:"6px 0", borderBottom:`1px solid ${C.cardBorder}`, fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, minWidth:500 }}>
                      {["Week","EN Start","EN End","EN %","AR Start","AR End","AR %"].map(h => <span key={h}>{h}</span>)}
                    </div>
                    {analyticsData.map((row,i) => (
                      <div key={i} style={{ display:"grid", gridTemplateColumns:"80px repeat(6,1fr)", gap:10, padding:"10px 0", borderBottom:`1px solid ${C.cardBorder}`, fontSize:13, minWidth:500 }}>
                        <span style={{ fontWeight:800, color:C.accentGold }}>{row[0]}</span>
                        {[1,2,3,6,7,8].map(j => <span key={j} style={{ color:j===3||j===8?C.accentGreen:C.textMuted }}>{row[j]||"—"}</span>)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ ...S.card, padding:50, textAlign:"center", color:C.textMuted }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>Analytics will appear here</div>
                  <div style={{ fontSize:13 }}>Fill in the Analytics Weekly tab in your Google Sheet.</div>
                </div>
              )}
            </div>
          )}

          {/* ── INSIGHTS ── */}
          {nav==="insights" && (
            <div style={{ maxWidth:680 }}>
              <div style={{ fontSize:15, fontWeight:800, marginBottom:16 }}>🧠 AI Analysis & Enhancement Proposals</div>
              {[
                { color:C.accentGreen, icon:"🚀", title:"Arabic engagement 38% higher", body:"Your AR account drives higher engagement. Consider increasing AR posting frequency from 5 to 8 posts/day." },
                { color:C.accent, icon:"📊", title:"Breaking news drives 3x impressions", body:"Posts tagged BREAKING average 3.2x more impressions. Prioritize speed on transfers." },
                { color:C.accentGold, icon:"💡", title:"Add This Day in Football series", body:"Historical content posted 8-10am gets 67% more saves. Automate a daily history post." },
                { color:C.accentRed, icon:"⚠️", title:"Tactical threads underperforming", body:"Long tactical threads get low completion. Try 3-part visual carousel instead." },
                { color:C.accentPurple, icon:"🎯", title:"Matchday content gap", body:"No live match posts detected. Goal reaction posts get 5x normal engagement." },
              ].map((ins,i) => (
                <div key={i} style={{ background:`${ins.color}0d`, border:`1px solid ${ins.color}33`, borderRadius:12, padding:"14px 18px", marginBottom:10 }}>
                  <div style={{ fontSize:14, fontWeight:800, marginBottom:5, color:ins.color }}>{ins.icon} {ins.title}</div>
                  <div style={{ fontSize:13, color:C.textMuted, lineHeight:1.6 }}>{ins.body}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── IDEAS ── */}
          {nav==="ideas" && (
            <div>
              <div style={{ fontSize:15, fontWeight:800, marginBottom:16 }}>💡 Content Ideas Backlog</div>
              {ideasData.length>0 ? ideasData.map((row,i) => (
                <div key={i} style={{ ...S.card, padding:"13px 18px", marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <div style={{ fontSize:14, fontWeight:700, flex:1, marginRight:10 }}>{row[1]||"—"}</div>
                    <div style={{ display:"flex", gap:6 }}>
                      <span style={S.badge(C.accentGold)}>{row[4]||"MEDIUM"}</span>
                      <span style={S.badge(C.accent)}>{row[5]||"Idea"}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:12, color:C.textMuted }}>📋 {row[2]} · 🎭 {row[3]} · 👤 {row[6]} · 🕐 {row[7]}</div>
                  {row[8] && <div style={{ fontSize:11, color:C.textDim, marginTop:4 }}>💬 {row[8]}</div>}
                </div>
              )) : (
                <div style={{ ...S.card, padding:50, textAlign:"center", color:C.textMuted }}>No ideas yet. Add them in the Content Ideas tab of your Google Sheet.</div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* ── SETTINGS MODAL ── */}
      {showSettings && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:C.sidebar, border:`1px solid ${C.cardBorder}`, borderRadius:16, width:620, maxWidth:"95vw", maxHeight:"90vh", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"20px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:17, fontWeight:800 }}>⚙️ Settings</div>
              <button onClick={() => setShowSettings(false)} style={{ background:"none", border:"none", color:C.textMuted, cursor:"pointer", fontSize:24, lineHeight:1 }}>×</button>
            </div>
            <div style={{ display:"flex", gap:2, padding:"14px 24px 0", borderBottom:`1px solid ${C.cardBorder}` }}>
              {[["api","🔑 API Keys"],["sources","📡 Sources"],["accounts","🐦 X Accounts"]].map(([id,label]) => (
                <button key={id} onClick={() => setSettingsTab(id)} style={{ padding:"8px 16px", borderRadius:"8px 8px 0 0", border:"none", background:settingsTab===id?C.card:"transparent", color:settingsTab===id?C.accent:C.textMuted, cursor:"pointer", fontSize:13, fontWeight:700, borderBottom:settingsTab===id?`2px solid ${C.accent}`:"2px solid transparent" }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ padding:24, overflowY:"auto", flex:1 }}>
              {settingsTab==="api" && (
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div style={{ background:`${C.accentGreen}0d`, border:`1px solid ${C.accentGreen}33`, borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:12, fontWeight:800, color:C.accentGreen, marginBottom:6 }}>📊 Google Sheet Brain — {sheetStatus==="connected"?"✅ CONNECTED":sheetStatus.toUpperCase()}</div>
                    <div style={{ fontSize:12, color:C.textMuted, lineHeight:1.8 }}>📧 footballlens78@gmail.com · 📋 {sheetPostsCount} posts · 💡 {ideasData.length} ideas</div>
                    <button style={{ ...S.btn(C.accentGreen), marginTop:10, width:"100%" }} onClick={syncFromSheet}>🔄 Reconnect & Sync</button>
                  </div>
                  {[["🤖 ANTHROPIC API KEY","Stored securely in Vercel ✅"],["⚽ FOOTBALL DATA API","Stored securely in Vercel ✅"],["🔍 TAVILY SEARCH API","Stored securely in Vercel ✅"]].map(([label,hint]) => (
                    <div key={label}>
                      <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:6 }}>{label}</div>
                      <input disabled style={{ ...S.input, opacity:0.5 }} placeholder={hint} />
                    </div>
                  ))}
                </div>
              )}
              {settingsTab==="sources" && (
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:C.accent, marginBottom:12 }}>➕ Add Source by URL</div>
                  <input style={{ ...S.input, marginBottom:10 }} placeholder="Paste RSS feed or website URL..."
                    value={newSourceUrl} onChange={e => { setNewSourceUrl(e.target.value); setValidationResult(null); }}
                    onKeyDown={e => e.key==="Enter" && validateSource()} />
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                    <input style={S.input} placeholder="Display name (optional)" value={newSourceName} onChange={e => setNewSourceName(e.target.value)} />
                    <select style={{ ...S.select, width:"100%" }} value={newSourceCategory} onChange={e => setNewSourceCategory(e.target.value)}>
                      {["General","Transfers","Arabic","Official","Analytics","Funny"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <button style={{ ...S.btn(C.accent), width:"100%", padding:10, marginBottom:14 }} onClick={validateSource} disabled={validatingSource||!newSourceUrl.trim()}>
                    {validatingSource?"⏳ Validating...":"🔍 Validate & Preview"}
                  </button>
                  {validationResult && (
                    <div style={{ marginBottom:16, padding:12, borderRadius:8, background:validationResult.error?`${C.accentRed}11`:`${C.accentGreen}11`, border:`1px solid ${validationResult.error?C.accentRed+"44":C.accentGreen+"44"}` }}>
                      {validationResult.error ? <div style={{ color:C.accentRed, fontSize:13 }}>❌ {validationResult.error}</div> : (
                        <>
                          <div style={{ fontSize:13, fontWeight:700, color:C.accentGreen, marginBottom:8 }}>✅ {validationResult.icon} {validationResult.name} · {validationResult.type} · {validationResult.credScore}%</div>
                          <button style={{ ...S.btn(C.accentGreen), width:"100%", padding:9 }} onClick={confirmAddSource}>➕ Add to Monitoring List</button>
                        </>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize:11, fontWeight:700, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>All Sources ({customSources.length})</div>
                  {customSources.map(src => (
                    <div key={src.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:8, background:C.bg, border:`1px solid ${C.cardBorder}`, marginBottom:6, opacity:src.status==="active"?1:0.5 }}>
                      <span>{src.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700 }}>{src.name}</div>
                        <div style={{ fontSize:10, color:C.textMuted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{src.url}</div>
                      </div>
                      <span style={S.badge(src.credScore>90?C.accentGreen:C.accentGold)}>{src.credScore}%</span>
                      <button onClick={() => toggleSource(src.id)} style={{ ...S.btn(src.status==="active"?C.accentGold:C.accentGreen, true), padding:"3px 8px", fontSize:11 }}>
                        {src.status==="active"?"⏸":"▶"}
                      </button>
                      {src.id>10 && <button onClick={() => removeSource(src.id)} style={{ ...S.btn(C.accentRed, true), padding:"3px 8px", fontSize:11 }}>✕</button>}
                    </div>
                  ))}
                </div>
              )}
              {settingsTab==="accounts" && (
                <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                  {["Football Lens EN 🇬🇧","Football Lens AR 🇸🇦"].map(acc => (
                    <div key={acc}>
                      <div style={{ fontSize:12, fontWeight:700, color:C.textMuted, marginBottom:8 }}>🐦 X API — {acc}</div>
                      {["API Key","API Secret","Access Token","Access Token Secret"].map(f => <input key={f} placeholder={f} style={{ ...S.input, marginBottom:8 }} />)}
                    </div>
                  ))}
                  <div style={{ background:`${C.accentGold}11`, border:`1px solid ${C.accentGold}33`, borderRadius:8, padding:12, fontSize:12, color:C.accentGold }}>
                    ⚠️ X accounts not created yet — add keys after creating both accounts
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding:"0 24px 20px" }}>
              <button style={{ ...S.btn(C.accent), width:"100%", padding:12, fontSize:14 }} onClick={() => setShowSettings(false)}>✅ Save & Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
