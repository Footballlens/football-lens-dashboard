import React, { useState, useEffect, useCallback } from "react";

// ─── CONFIGURATION ──────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxDgz-Zxi989GzhscU7922WqJ1iVE1d4dALVkBcTP1cvfPSoYOfSW7UUKu2TkPxQxluxQ/exec";
const SHEET_TABS = {
  posts: "Posts Log",
  sources: "Sources",
  analytics: "Analytics Weekly",
  ideas: "Content Ideas",
};

// ─── SHEET API HELPERS ───────────────────────────────────
async function sheetRead(sheetName, range = "A1:Z1000") {
  const url = `${APPS_SCRIPT_URL}?action=read&sheet=${encodeURIComponent(sheetName)}&range=${encodeURIComponent(range)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Read failed");
  return data.data || [];
}

async function sheetAppend(sheetName, row) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ action: "append", sheet: sheetName, row }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Append failed");
  return data;
}

async function sheetPing() {
  const url = `${APPS_SCRIPT_URL}?action=ping`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Ping failed");
  return data;
}

// ─── COLORS ─────────────────────────────────────────────
const COLORS = {
  dark: {
    bg: "#080c10", surface: "#0d1117", card: "#111820", border: "#1e2d3d",
    accent: "#00d4ff", accentGold: "#f0a500", accentGreen: "#00e676",
    accentRed: "#ff3d57", text: "#e8f0fe", textMuted: "#7a8fa6",
    textDim: "#3d5166", gradient: "linear-gradient(135deg, #080c10 0%, #0d1520 100%)",
  },
  light: {
    bg: "#f0f4f8", surface: "#ffffff", card: "#ffffff", border: "#d0dce8",
    accent: "#0066cc", accentGold: "#d48800", accentGreen: "#00a651",
    accentRed: "#e0001e", text: "#0a1628", textMuted: "#4a6080",
    textDim: "#9ab0c8", gradient: "linear-gradient(135deg, #f0f4f8 0%, #e4ecf5 100%)",
  },
};

const MOCK_POSTS = [
  {
    id: 1, type: "Breaking News 🔴", tier: "BREAKING", credibility: 96,
    timeAgo: "3 min ago",
    en: "🚨 BREAKING: Kylian Mbappé set to undergo medical at Arsenal today. Personal terms already agreed on a 5-year deal. Announcement expected within 48 hours. #Arsenal #Mbappe",
    ar: "🚨 عاجل: كيليان مبابي سيخضع للفحص الطبي في آرسنال اليوم. تم الاتفاق على الشروط الشخصية لعقد مدته 5 سنوات. يُتوقع الإعلان خلال 48 ساعة.",
    sources: [
      { name: "@FabrizioRomano", url: "https://twitter.com/fabrizioromano", icon: "🐦", score: 97 },
      { name: "Sky Sports", url: "https://skysports.com", icon: "📺", score: 94 },
      { name: "The Athletic", url: "https://theathletic.com", icon: "📰", score: 93 },
      { name: "beIN Sports AR", url: "https://beinsports.com/ar", icon: "📡", score: 91 },
    ],
    visual: {
      recommended: true, reason: "High-impact breaking transfer — image essential",
      type: "Player photo + both club badges",
      style: "Dark breaking news overlay, red banner, bold white text",
      prompt: "Kylian Mbappe professional photo, Arsenal FC badge on left, PSG badge crossed out on right, dark dramatic background, red BREAKING banner at top, bold white typography, cinematic football edit style, 1200x675px",
      tools: ["Adobe Firefly", "Canva AI", "Microsoft Designer"], dimensions: "1200 x 675px",
    },
    tone: "Urgent / Breaking", status: "pending", account: "both",
  },
  {
    id: 2, type: "Transfer Rumours 🔄", tier: "TRANSFER", credibility: 78,
    timeAgo: "18 min ago",
    en: "👀 Rumour mill: Real Madrid monitoring Jude Bellingham future amid contract uncertainty. Exit rumours growing if Champions League form dips.",
    ar: "👀 شائعات: ريال مدريد يراقب مستقبل بيلينغهام. إشاعات الرحيل تتصاعد إذا تراجع الأداء في دوري الأبطال.",
    sources: [
      { name: "Marca", url: "https://marca.com", icon: "🗞️", score: 82 },
      { name: "@MikeVertigans", url: "https://twitter.com", icon: "🐦", score: 74 },
    ],
    visual: {
      recommended: true, reason: "Big name rumour — visual boosts engagement",
      type: "Player in action + Real Madrid crest",
      style: "Moody blue/white split, question mark graphic",
      prompt: "Jude Bellingham Real Madrid kit action shot, moody cinematic lighting, blue and white color grade, large question mark overlay, RUMOUR badge top right, 1200x675px",
      tools: ["Adobe Firefly", "Canva AI"], dimensions: "1200 x 675px",
    },
    tone: "Speculative / Curious", status: "pending", account: "both",
  },
  {
    id: 3, type: "History & Stories 📜", tier: "STORY", credibility: 99,
    timeAgo: "45 min ago",
    en: "🕰️ On this day in 1999: Manchester United completed the most dramatic comeback in football history. Down 1-0 to Bayern — Sheringham & Solskjaer in injury time. The Treble was born. 🔴",
    ar: "🕰️ في مثل هذا اليوم 1999: مانشستر يونايتد أتمّ أعظم انقلاب في التاريخ. خسارة 1-0 أمام بايرن — شيرينغهام وسولسكيار في الوقت الإضافي. وُلد الثلاثي.",
    sources: [
      { name: "UEFA Official", url: "https://uefa.com", icon: "🏆", score: 99 },
      { name: "BBC Sport Archive", url: "https://bbc.co.uk/sport", icon: "📻", score: 98 },
    ],
    visual: {
      recommended: true, reason: "Historic moment — archival style graphic performs very well",
      type: "Vintage match graphic, retro style",
      style: "Vintage newspaper, sepia tones, 1999 date stamp",
      prompt: "Manchester United 1999 Champions League treble celebration, vintage sepia photo effect, newspaper headline overlay ON THIS DAY, red and gold color treatment, retro typography, 1200x675px",
      tools: ["Canva AI", "Adobe Firefly"], dimensions: "1200 x 675px",
    },
    tone: "Nostalgic / Storytelling", status: "pending", account: "both",
  },
];

const RSS_SOURCES = [
  { name: "Fabrizio Romano", platform: "X/Twitter", status: "live", credScore: 97, icon: "🐦" },
  { name: "Sky Sports Football", platform: "RSS", status: "live", credScore: 94, icon: "📺" },
  { name: "ESPN FC", platform: "RSS", status: "live", credScore: 93, icon: "🏟️" },
  { name: "beIN Sports AR", platform: "Web", status: "live", credScore: 91, icon: "📡" },
  { name: "BBC Sport Football", platform: "RSS", status: "live", credScore: 95, icon: "📻" },
  { name: "Goal.com EN", platform: "RSS", status: "live", credScore: 89, icon: "⚽" },
  { name: "Kooora.com", platform: "Web", status: "live", credScore: 87, icon: "🌐" },
  { name: "Tifo Football", platform: "YouTube", status: "live", credScore: 94, icon: "🎥" },
  { name: "@David_Ornstein", platform: "X/Twitter", status: "live", credScore: 96, icon: "🐦" },
  { name: "FilGoal", platform: "Web", status: "live", credScore: 86, icon: "🌍" },
  { name: "TikTok #football", platform: "TikTok", status: "scanning", credScore: 70, icon: "🎵" },
  { name: "Instagram #transfers", platform: "Instagram", status: "scanning", credScore: 65, icon: "📸" },
];

const AI_INSIGHTS = [
  { type: "opportunity", icon: "🚀", title: "Arabic engagement 38% higher", body: "Your AR account drives higher engagement per post. Consider increasing AR posting frequency from 5 to 8 posts/day." },
  { type: "pattern", icon: "📊", title: "Breaking news drives 3x impressions", body: "Posts tagged BREAKING average 3.2x more impressions. Prioritize speed on transfers." },
  { type: "enhancement", icon: "💡", title: "Add This Day in Football series", body: "Historical content posted 8-10am gets 67% more saves. Automate a daily history post for both accounts." },
  { type: "warning", icon: "⚠️", title: "Tactical threads underperforming", body: "Long tactical threads get low completion. Try breaking into 3-part visual carousel instead." },
  { type: "opportunity", icon: "🎯", title: "beIN Sports overlap audience", body: "Your Arabic audience indexes heavily with beIN viewers — lean into this for AR growth." },
];

const CONTENT_TYPES = ["All", "Breaking News 🔴", "Transfer Rumours 🔄", "Match Results ⚽", "Tactical Analysis 🧠", "Viral & Funny 😂", "History & Stories 📜", "Fan Reactions 🔥", "Polls & Debates ❓"];

export default function FootballLensDashboard() {
  const [theme, setTheme] = useState("dark");
  const [activeTab, setActiveTab] = useState("queue");
  const [posts, setPosts] = useState(MOCK_POSTS);
  const [filter, setFilter] = useState("All");
  const [expandedPost, setExpandedPost] = useState(null);
  const [editingPost, setEditingPost] = useState(null);
  const [editText, setEditText] = useState({ en: "", ar: "" });
  const [generating, setGenerating] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [newTone, setNewTone] = useState("Breaking");
  const [newLang, setNewLang] = useState("both");
  const [generatedPost, setGeneratedPost] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [liveTime, setLiveTime] = useState(new Date());
  const [sheetStatus, setSheetStatus] = useState("disconnected");
  const [sheetMsg, setSheetMsg] = useState("");
  const [syncingPost, setSyncingPost] = useState(null);
  const [ideasData, setIdeasData] = useState([]);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [sheetPostsCount, setSheetPostsCount] = useState(0);

  const C = COLORS[theme];

  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-connect on load
  useEffect(() => { connectSheet(); }, []);

  const connectSheet = useCallback(async () => {
    setSheetStatus("connecting");
    setSheetMsg("Connecting to Football Lens Brain...");
    try {
      await sheetPing();
      // Load all tabs
      const [postsRows, ideasRows, analyticsRows] = await Promise.all([
        sheetRead(SHEET_TABS.posts, "A5:V1000"),
        sheetRead(SHEET_TABS.ideas, "A5:I1000"),
        sheetRead(SHEET_TABS.analytics, "A5:N20"),
      ]);
      const realPosts = postsRows.filter(r => r[0] && r[0] !== "Date");
      setSheetPostsCount(realPosts.length);
      setIdeasData(ideasRows.filter(r => r[0] && r[0] !== "Date Added"));
      setAnalyticsData(analyticsRows.filter(r => r[0] && r[0] !== "Week"));
      setSheetStatus("connected");
      setSheetMsg(`✅ Football Lens Brain connected! ${realPosts.length} posts logged.`);
      setTimeout(() => setSheetMsg(""), 4000);
    } catch (e) {
      setSheetStatus("error");
      setSheetMsg(`❌ Connection failed: ${e.message}`);
    }
  }, []);

  const logPostToSheet = async (post, status) => {
    if (sheetStatus !== "connected") return;
    setSyncingPost(post.id);
    try {
      const now = new Date();
      await sheetAppend(SHEET_TABS.posts, [
        now.toLocaleDateString(), now.toLocaleTimeString(),
        post.type, post.tone, post.en, post.ar,
        post.sources[0]?.name || "", post.sources[1]?.name || "",
        post.credibility, post.visual.recommended ? "YES" : "NO",
        post.account.toUpperCase(), status,
        now.toLocaleTimeString(), "", "", "", "", "", "", "", "", ""
      ]);
      setSheetPostsCount(n => n + 1);
      setSheetMsg(`✅ Post logged to Google Sheet Brain!`);
      setTimeout(() => setSheetMsg(""), 3000);
    } catch (e) {
      setSheetMsg(`⚠️ Sheet sync failed: ${e.message}`);
    }
    setSyncingPost(null);
  };

  const logIdeaToSheet = async (topic, tone, lang) => {
    if (sheetStatus !== "connected") return;
    try {
      await sheetAppend(SHEET_TABS.ideas, [
        new Date().toLocaleDateString(), topic, "AI Generated",
        tone, "HIGH", "Generated", lang.toUpperCase(), "", "Via dashboard"
      ]);
    } catch (e) { console.error(e); }
  };

  const approvePost = async (id, lang) => {
    const post = posts.find(p => p.id === id);
    const newStatus = lang === "reject" ? "rejected" : "approved";
    setPosts(p => p.map(p2 => p2.id === id ? { ...p2, status: newStatus } : p2));
    if (post) await logPostToSheet(post, lang === "reject" ? "Rejected" : "Approved");
  };

  const startEdit = (post) => { setEditingPost(post.id); setEditText({ en: post.en, ar: post.ar }); };
  const saveEdit = (id) => {
    setPosts(p => p.map(p2 => p2.id === id ? { ...p2, en: editText.en, ar: editText.ar } : p2));
    setEditingPost(null);
  };

  const generatePost = async () => {
    if (!newTopic.trim()) return;
    setGenerating(true);
    setGeneratedPost(null);
    await logIdeaToSheet(newTopic, newTone, newLang);
    try {
      if (apiKey) {
        const prompt = `You are Football Lens, a bilingual football media brand. Generate a football social media post.
Topic: ${newTopic}
Tone: ${newTone}
Respond ONLY with valid JSON (no markdown):
{"en":"English post max 280 chars with emojis","ar":"Arabic post max 280 chars with emojis","visualRecommended":true,"visualReason":"one sentence","imagePrompt":"detailed prompt or null","tone":"label","credibility":85}`;
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
        });
        const data = await res.json();
        const text = data.content?.map(i => i.text || "").join("") || "";
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        setGeneratedPost({
          id: Date.now(), type: `${newTone} ✨`, tier: newTone.toUpperCase().slice(0, 8),
          credibility: parsed.credibility || 85, timeAgo: "Just now",
          en: parsed.en, ar: parsed.ar,
          sources: [{ name: "AI Generated", url: "#", icon: "🤖", score: 85 }],
          visual: { recommended: parsed.visualRecommended, reason: parsed.visualReason, type: "AI suggested", style: "See prompt", prompt: parsed.imagePrompt, tools: ["Adobe Firefly", "Canva AI"], dimensions: "1200 x 675px" },
          tone: parsed.tone || newTone, status: "pending", account: newLang,
        });
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setGeneratedPost({
          id: Date.now(), type: `${newTone} ✨`, tier: "DEMO",
          credibility: 88, timeAgo: "Just now",
          en: `⚡ [DEMO] ${newTopic} — Add your OpenAI key in Settings for real AI generation. #FootballLens`,
          ar: `⚡ [تجريبي] ${newTopic} — أضف مفتاح OpenAI في الإعدادات. #FootballLens`,
          sources: [{ name: "Demo Mode", url: "#", icon: "🤖", score: 85 }],
          visual: { recommended: true, reason: "Demo suggestion", type: "Suggested graphic", style: "Modern overlay", prompt: `${newTopic} football graphic 1200x675px`, tools: ["Adobe Firefly", "Canva AI"], dimensions: "1200 x 675px" },
          tone: newTone, status: "pending", account: newLang,
        });
      }
    } catch (e) { console.error(e); }
    setGenerating(false);
  };

  const addGeneratedToQueue = () => {
    if (generatedPost) { setPosts(p => [generatedPost, ...p]); setGeneratedPost(null); setNewTopic(""); setActiveTab("queue"); }
  };

  const filteredPosts = filter === "All" ? posts : posts.filter(p => p.type === filter);
  const pendingCount = posts.filter(p => p.status === "pending").length;
  const tierColor = (t) => ({ BREAKING: C.accentRed, TRANSFER: C.accentGold, VIRAL: "#ff6b35", ANALYSIS: C.accent, STORY: "#a78bfa", DEMO: C.textMuted })[t] || C.accent;

  const S = {
    root: { minHeight: "100vh", background: C.gradient, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text, transition: "all 0.3s" },
    header: { background: theme === "dark" ? "rgba(8,12,16,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${C.border}`, padding: "0 24px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 },
    navBtn: (a) => ({ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: a ? C.accent : "transparent", color: a ? "#fff" : C.textMuted }),
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 14 },
    tierBadge: (t) => ({ fontSize: 11, fontWeight: 800, letterSpacing: 1, padding: "3px 8px", borderRadius: 5, background: `${tierColor(t)}22`, color: tierColor(t), border: `1px solid ${tierColor(t)}44` }),
    postText: { background: theme === "dark" ? "#0a1520" : "#f5f8fc", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", fontSize: 14, lineHeight: 1.6, marginBottom: 8 },
    input: { width: "100%", background: theme === "dark" ? "#0a1520" : "#f5f8fc", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" },
    select: { background: theme === "dark" ? "#0a1520" : "#f5f8fc", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none" },
    textarea: { width: "100%", background: theme === "dark" ? "#0a1520" : "#f5f8fc", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 13, outline: "none", resize: "vertical", minHeight: 80, boxSizing: "border-box", fontFamily: "inherit" },
    btn: (color, outline) => ({ padding: "8px 16px", borderRadius: 8, border: outline ? `1px solid ${color}` : "none", background: outline ? "transparent" : color, color: outline ? color : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }),
    sideCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 16 },
    sideTitle: { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: C.textMuted, marginBottom: 12 },
    statCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px" },
    accountTab: (a) => ({ flex: 1, padding: 9, textAlign: "center", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, background: a ? C.accent : "transparent", color: a ? "#fff" : C.textMuted, border: "none" }),
    filterBtn: (a) => ({ padding: "5px 12px", borderRadius: 20, border: `1px solid ${a ? C.accent : C.border}`, background: a ? C.accent : "transparent", color: a ? "#fff" : C.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }),
    sheetBadge: {
      display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      background: sheetStatus === "connected" ? `${C.accentGreen}22` : sheetStatus === "connecting" ? `${C.accentGold}22` : sheetStatus === "error" ? `${C.accentRed}22` : `${C.textDim}22`,
      color: sheetStatus === "connected" ? C.accentGreen : sheetStatus === "connecting" ? C.accentGold : sheetStatus === "error" ? C.accentRed : C.textMuted,
      border: `1px solid ${sheetStatus === "connected" ? C.accentGreen + "55" : C.border}`,
      cursor: "pointer",
    },
  };

  const PostCard = ({ post }) => {
    const [lang, setLang] = useState("en");
    const isExpanded = expandedPost === post.id;
    const isEditing = editingPost === post.id;
    return (
      <div style={{ ...S.card, borderColor: post.status === "approved" ? C.accentGreen + "66" : post.status === "rejected" ? C.accentRed + "44" : C.border }}>
        <div style={{ padding: "14px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={S.tierBadge(post.tier)}>{post.tier}</span>
            <span style={{ fontSize: 12, color: C.textMuted }}>{post.type}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: post.credibility >= 85 ? C.accentGreen : C.accentGold, fontWeight: 700 }}>{post.credibility >= 85 ? "🟢" : "🟡"} {post.credibility}%</span>
            <span style={{ fontSize: 11, color: C.textDim }}>{post.timeAgo}</span>
            {post.status !== "pending" && <span style={{ fontSize: 11, background: post.status === "approved" ? C.accentGreen + "22" : C.accentRed + "22", color: post.status === "approved" ? C.accentGreen : C.accentRed, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>{post.status.toUpperCase()}</span>}
            {syncingPost === post.id && <span style={{ fontSize: 11, color: C.accentGold, animation: "pulse 1s infinite" }}>⏳ Syncing to Sheet...</span>}
          </div>
        </div>
        <div style={{ padding: "0 18px 14px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button style={S.accountTab(lang === "en")} onClick={() => setLang("en")}>🇬🇧 Football Lens EN</button>
            <button style={S.accountTab(lang === "ar")} onClick={() => setLang("ar")}>🇸🇦 Football Lens AR</button>
          </div>
          {isEditing ? (
            <textarea style={S.textarea} value={lang === "en" ? editText.en : editText.ar}
              onChange={e => setEditText(p => ({ ...p, [lang]: e.target.value }))}
              dir={lang === "ar" ? "rtl" : "ltr"} />
          ) : (
            <div style={{ ...S.postText, direction: lang === "ar" ? "rtl" : "ltr", textAlign: lang === "ar" ? "right" : "left" }}>
              {lang === "en" ? post.en : post.ar}
            </div>
          )}
          {isExpanded && (
            <>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>📎 Sources & References</div>
                {post.sources.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                    <span>{s.icon}</span>
                    <a href={s.url} target="_blank" rel="noreferrer" style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}>{s.name}</a>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: s.score > 85 ? C.accentGreen : C.accentGold, fontWeight: 700 }}>{s.score}% credibility</span>
                  </div>
                ))}
              </div>
              <div style={{ background: post.visual.recommended ? `${C.accentGold}11` : `${C.textDim}11`, border: `1px solid ${post.visual.recommended ? C.accentGold + "44" : C.textDim}`, borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: post.visual.recommended ? C.accentGold : C.textMuted, marginBottom: 6 }}>
                  🖼️ VISUAL RECOMMENDATION: {post.visual.recommended ? "✅ USE IMAGE" : "❌ TEXT ONLY"}
                </div>
                <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>{post.visual.reason}</div>
                {post.visual.recommended && post.visual.prompt && (
                  <>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, marginBottom: 4 }}>📋 AI Image Prompt — click to copy:</div>
                    <div onClick={() => navigator.clipboard?.writeText(post.visual.prompt)}
                      style={{ background: theme === "dark" ? "#0a1520" : "#f0f4f8", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: C.textMuted, fontFamily: "monospace", cursor: "pointer", wordBreak: "break-word", border: `1px solid ${C.border}` }}>
                      {post.visual.prompt}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                      🎨 Free tools: {post.visual.tools.join(" · ")} &nbsp;·&nbsp; 📐 {post.visual.dimensions}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          <button onClick={() => setExpandedPost(isExpanded ? null : post.id)}
            style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, fontWeight: 600, marginTop: 10, padding: 0 }}>
            {isExpanded ? "▲ Hide details" : "▼ Sources, references & visual guide"}
          </button>
        </div>
        {post.status === "pending" && (
          <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isEditing ? (
              <>
                <button style={S.btn(C.accentGreen)} onClick={() => saveEdit(post.id)}>💾 Save Changes</button>
                <button style={S.btn(C.textMuted, true)} onClick={() => setEditingPost(null)}>Cancel</button>
              </>
            ) : (
              <>
                <button style={S.btn(C.accentGreen)} onClick={() => approvePost(post.id, "both")}>
                  {sheetStatus === "connected" ? "✅ Approve + Log to Sheet" : "✅ Approve Both"}
                </button>
                <button style={S.btn(C.accent, true)} onClick={() => approvePost(post.id, "en")}>🇬🇧 EN Only</button>
                <button style={S.btn(C.accentGold, true)} onClick={() => approvePost(post.id, "ar")}>🇸🇦 AR Only</button>
                <button style={S.btn(C.textMuted, true)} onClick={() => startEdit(post)}>✏️ Edit</button>
                <button style={S.btn(C.accentRed, true)} onClick={() => approvePost(post.id, "reject")}>✕ Reject</button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        button:hover { opacity: 0.85; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
      `}</style>

      {/* Settings Modal */}
      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 480, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>⚙️ Settings & API Keys</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 20 }}>Keys stored in browser session only.</div>

            <div style={{ background: theme === "dark" ? "#0a1520" : "#f0f8f4", border: `1px solid ${C.accentGreen}33`, borderRadius: 10, padding: "14px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.accentGreen, marginBottom: 8 }}>
                📊 GOOGLE SHEET BRAIN — {sheetStatus === "connected" ? "✅ CONNECTED" : "⏳ " + sheetStatus.toUpperCase()}
              </div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.8 }}>
                📧 footballlens78@gmail.com<br />
                🔗 Apps Script API: Active<br />
                📋 Posts logged: {sheetPostsCount}<br />
                💡 Ideas loaded: {ideasData.length}
              </div>
              <button style={{ ...S.btn(C.accentGreen), marginTop: 10, width: "100%" }} onClick={connectSheet}>
                {sheetStatus === "connecting" ? "⏳ Connecting..." : "🔄 Reconnect Sheet"}
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>🤖 OPENAI API KEY</div>
              <input type="password" placeholder="sk-..." style={S.input} value={apiKey} onChange={e => setApiKey(e.target.value)} />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                Get yours at platform.openai.com/api-keys — free credits on signup
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>🐦 X API — FOOTBALL LENS EN</div>
              <input placeholder="API Key" style={{ ...S.input, marginBottom: 8 }} />
              <input placeholder="Access Token" style={S.input} />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>🐦 X API — FOOTBALL LENS AR</div>
              <input placeholder="API Key" style={{ ...S.input, marginBottom: 8 }} />
              <input placeholder="Access Token" style={S.input} />
            </div>

            <button style={{ ...S.btn(C.accent), width: "100%", padding: 12 }} onClick={() => setShowSettings(false)}>
              Save & Close
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: `linear-gradient(135deg, ${C.accentGreen}, ${C.accent})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔭</div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px" }}>Football Lens</span>
          <span style={{ fontSize: 10, background: C.accentRed, color: "#fff", padding: "2px 6px", borderRadius: 4, fontWeight: 700, letterSpacing: 1 }}>COMMAND CENTER</span>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {[["queue","📋 Queue"],["generate","✨ Generate"],["sources","📡 Sources"],["analytics","📊 Analytics"],["insights","🧠 Insights"],["ideas","💡 Ideas"]].map(([id, label]) => (
            <button key={id} style={S.navBtn(activeTab === id)} onClick={() => setActiveTab(id)}>
              {label}{id === "queue" && pendingCount > 0 && <span style={{ marginLeft: 5, background: C.accentRed, color: "#fff", borderRadius: 10, padding: "0 5px", fontSize: 10 }}>{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={S.sheetBadge} onClick={connectSheet} title="Click to reconnect">
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", animation: sheetStatus === "connecting" ? "pulse 1s infinite" : "none" }} />
            {sheetStatus === "connected" ? `📊 Brain Live · ${sheetPostsCount} posts` : sheetStatus === "connecting" ? "⏳ Connecting..." : sheetStatus === "error" ? "❌ Sheet Error — click to retry" : "Sheet Disconnected"}
          </div>
          <span style={{ fontSize: 12, color: C.textMuted }}>{liveTime.toLocaleTimeString()}</span>
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.text, cursor: "pointer", fontSize: 15 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
          <button onClick={() => setShowSettings(true)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>⚙️ Settings</button>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 20px" }}>

        {sheetMsg && (
          <div style={{ background: sheetStatus === "connected" ? `${C.accentGreen}22` : sheetStatus === "error" ? `${C.accentRed}22` : `${C.accentGold}22`, border: `1px solid ${sheetStatus === "connected" ? C.accentGreen : sheetStatus === "error" ? C.accentRed : C.accentGold}44`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: sheetStatus === "connected" ? C.accentGreen : sheetStatus === "error" ? C.accentRed : C.accentGold, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{sheetMsg}</span>
            <button onClick={() => setSheetMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "currentColor", fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            ["Pending Approval", pendingCount, C.accentRed, "awaiting your review"],
            ["Posts in Brain", sheetPostsCount, C.accentGreen, sheetStatus === "connected" ? "✅ live from sheet" : "connect sheet"],
            ["Ideas Backlog", ideasData.length || "—", C.accentGold, "content ideas"],
            ["Sources Live", RSS_SOURCES.filter(s => s.status === "live").length, C.accent, "actively monitored"],
            ["🇬🇧 EN Account", "Active", C.accent, "Football Lens EN"],
            ["🇸🇦 AR Account", "Active", C.accentGold, "Football Lens AR"],
          ].map(([label, val, color, sub], i) => (
            <div key={i} style={S.statCard}>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 310px", gap: 20 }}>
          <div>
            {/* QUEUE */}
            {activeTab === "queue" && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  {CONTENT_TYPES.map(f => <button key={f} style={S.filterBtn(filter === f)} onClick={() => setFilter(f)}>{f}</button>)}
                </div>
                {filteredPosts.length === 0 ? (
                  <div style={{ ...S.card, padding: 40, textAlign: "center", color: C.textMuted }}>Queue is empty for this filter.</div>
                ) : filteredPosts.map(p => <PostCard key={p.id} post={p} />)}
              </>
            )}

            {/* GENERATE */}
            {activeTab === "generate" && (
              <>
                <div style={{ ...S.card, padding: 20 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>✨ AI Content Generator</div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>TOPIC / STORY</div>
                    <input style={S.input} placeholder="e.g. Salah injury update, Mbappé transfer, Champions League draw..." value={newTopic} onChange={e => setNewTopic(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && generatePost()} />
                  </div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>TONE</div>
                      <select style={{ ...S.select, width: "100%" }} value={newTone} onChange={e => setNewTone(e.target.value)}>
                        {["Breaking","Transfer","Analytical","Funny/Sarcastic","Nostalgic","Hype","Debate"].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>LANGUAGE</div>
                      <select style={{ ...S.select, width: "100%" }} value={newLang} onChange={e => setNewLang(e.target.value)}>
                        <option value="both">Both EN + AR</option>
                        <option value="en">English Only</option>
                        <option value="ar">Arabic Only</option>
                      </select>
                    </div>
                  </div>
                  <button style={{ ...S.btn(generating || !newTopic.trim() ? C.textMuted : C.accent), width: "100%", padding: 12, fontSize: 15 }} onClick={generatePost} disabled={generating || !newTopic.trim()}>
                    {generating ? "⏳ Generating..." : "🚀 Generate Post"}
                  </button>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    {sheetStatus === "connected" && <div style={{ fontSize: 11, color: C.accentGreen }}>✅ Topics auto-logged to Sheet Brain</div>}
                    {!apiKey && <div style={{ fontSize: 11, color: C.textMuted }}>💡 Add OpenAI key in Settings for real AI</div>}
                  </div>
                </div>
                {generatedPost && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.accentGreen, marginBottom: 10 }}>✅ Post ready — review and add to queue:</div>
                    <PostCard post={generatedPost} />
                    <button style={{ ...S.btn(C.accentGreen), width: "100%", padding: 12, fontSize: 14, marginTop: -8 }} onClick={addGeneratedToQueue}>➕ Add to Approval Queue</button>
                  </>
                )}
              </>
            )}

            {/* SOURCES */}
            {activeTab === "sources" && (
              <div style={S.card}>
                <div style={{ padding: "18px 20px 6px", fontSize: 16, fontWeight: 800 }}>📡 Open Intelligence Network</div>
                <div style={{ padding: "0 20px 18px" }}>
                  <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>Football Lens monitors {RSS_SOURCES.length} verified sources + AI open search across all platforms.</div>
                  {RSS_SOURCES.map((s, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 20 }}>{s.icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{s.platform}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: s.credScore > 85 ? C.accentGreen : C.accentGold }}>{s.credScore}%</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.status === "live" ? C.accentGreen : C.accentGold, animation: s.status === "live" ? "pulse 2s infinite" : "none" }} />
                          <span style={{ fontSize: 11, color: C.textMuted }}>{s.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 14, padding: "12px 14px", background: `${C.accent}11`, border: `1px solid ${C.accent}33`, borderRadius: 8, fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>
                    🔭 <strong style={{ color: C.accent }}>AI Open Search</strong> also scans X trending topics, YouTube football content, Instagram & TikTok hashtags beyond fixed sources — catching stories before they go mainstream.
                  </div>
                </div>
              </div>
            )}

            {/* ANALYTICS */}
            {activeTab === "analytics" && (
              analyticsData.length > 0 ? (
                <div style={S.card}>
                  <div style={{ padding: "18px 20px 8px", fontSize: 16, fontWeight: 800 }}>📊 Live Analytics — Google Sheet Brain</div>
                  <div style={{ padding: "0 20px 20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "70px repeat(6,1fr)", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" }}>
                      {["Week","EN Start","EN End","EN Growth","AR Start","AR End","AR Growth"].map(h => <span key={h}>{h}</span>)}
                    </div>
                    {analyticsData.map((row, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "70px repeat(6,1fr)", gap: 8, padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                        <span style={{ fontWeight: 800, color: C.accentGold }}>{row[0]}</span>
                        {[1,2,3,6,7,8].map(j => <span key={j} style={{ color: j === 3 || j === 8 ? C.accentGreen : C.textMuted }}>{row[j] || "—"}</span>)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ ...S.card, padding: 50, textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Analytics will appear here</div>
                  <div style={{ fontSize: 13, color: C.textMuted }}>Fill in the Analytics Weekly tab in your Google Sheet to see live data here.</div>
                </div>
              )
            )}

            {/* INSIGHTS */}
            {activeTab === "insights" && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>🧠 AI Analysis & Enhancement Proposals</div>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Powered by your Sheet Brain — insights improve as more posts are logged.</div>
                {AI_INSIGHTS.map((ins, i) => {
                  const colors = { opportunity: C.accentGreen, pattern: C.accent, enhancement: C.accentGold, warning: C.accentRed };
                  return (
                    <div key={i} style={{ background: `${colors[ins.type]}11`, border: `1px solid ${colors[ins.type]}33`, borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 5 }}>{ins.icon} {ins.title}</div>
                      <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>{ins.body}</div>
                    </div>
                  );
                })}
                <div style={{ ...S.card, padding: 18, marginTop: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>📈 3-Month Growth Benchmarks</div>
                  {[["Month 1","500-1K","300-700","3-5%","Build consistency & daily posting"],["Month 2","1K-3K","700-2K","4-6%","Trend hijacking kicks in"],["Month 3","3K-8K","2K-6K","5-8%","X monetization threshold"]].map((r, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 90px 90px 65px 1fr", gap: 8, padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12, alignItems: "center" }}>
                      <span style={{ fontWeight: 800, color: C.accent }}>{r[0]}</span>
                      <span style={{ color: C.text }}>🇬🇧 {r[1]}</span>
                      <span style={{ color: C.text }}>🇸🇦 {r[2]}</span>
                      <span style={{ color: C.accentGreen, fontWeight: 700 }}>{r[3]}</span>
                      <span style={{ color: C.textMuted }}>{r[4]}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* IDEAS */}
            {activeTab === "ideas" && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>💡 Content Ideas Backlog</div>
                {ideasData.length > 0 ? ideasData.map((row, i) => (
                  <div key={i} style={{ ...S.card, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, flex: 1, marginRight: 10 }}>{row[1] || "—"}</div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, background: `${C.accentGold}22`, color: C.accentGold, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>{row[4] || "MEDIUM"}</span>
                        <span style={{ fontSize: 11, background: `${C.accent}22`, color: C.accent, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>{row[5] || "Idea"}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>📋 {row[2]} &nbsp;·&nbsp; 🎭 {row[3]} &nbsp;·&nbsp; 👤 {row[6]} &nbsp;·&nbsp; 🕐 {row[7]}</div>
                    {row[8] && <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>💬 {row[8]}</div>}
                  </div>
                )) : (
                  <div style={{ ...S.card, padding: 40, textAlign: "center" }}>
                    <div style={{ fontSize: 13, color: C.textMuted }}>
                      {sheetStatus === "connected" ? "No ideas found in Sheet. Add some to the 💡 Content Ideas tab." : "Connect Google Sheet to load your ideas backlog."}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* SIDEBAR */}
          <div>
            <div style={S.sideCard}>
              <div style={S.sideTitle}>📊 Google Sheet Brain</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: sheetStatus === "connected" ? C.accentGreen : sheetStatus === "error" ? C.accentRed : C.accentGold, animation: sheetStatus === "connecting" ? "pulse 1s infinite" : "none" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: sheetStatus === "connected" ? C.accentGreen : C.textMuted }}>
                  {sheetStatus === "connected" ? "Connected & Syncing" : sheetStatus === "connecting" ? "Connecting..." : sheetStatus === "error" ? "Connection Error" : "Disconnected"}
                </span>
              </div>
              {sheetStatus === "connected" ? (
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.9 }}>
                  ✅ Posts auto-logged on approval<br />
                  ✅ Ideas synced on generation<br />
                  ✅ {sheetPostsCount} posts in brain<br />
                  ✅ {ideasData.length} ideas loaded<br />
                  ✅ No private key needed
                </div>
              ) : (
                <button style={{ ...S.btn(C.accentGreen), width: "100%", marginTop: 6 }} onClick={connectSheet}>
                  🔄 Retry Connection
                </button>
              )}
            </div>

            <div style={S.sideCard}>
              <div style={S.sideTitle}>📋 Queue Status</div>
              {[["Pending", pendingCount, C.accentGold], ["Approved", posts.filter(p => p.status === "approved").length, C.accentGreen], ["Rejected", posts.filter(p => p.status === "rejected").length, C.accentRed]].map(([l, c, col]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: C.textMuted }}>{l}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: col }}>{c}</span>
                </div>
              ))}
            </div>

            <div style={S.sideCard}>
              <div style={S.sideTitle}>⚡ Quick Actions</div>
              {[
                ["🔴 Breaking News", "generate", "Breaking", ""],
                ["🔄 Transfer Rumour", "generate", "Transfer", ""],
                ["📅 This Day in Football", "generate", "Nostalgic", "This day in football history"],
                ["😂 Viral/Funny Post", "generate", "Funny/Sarcastic", ""],
                ["📡 View Sources", "sources", null, ""],
                ["🧠 AI Insights", "insights", null, ""],
                ["💡 Ideas Backlog", "ideas", null, ""],
              ].map(([label, tab, tone, topic]) => (
                <button key={label} onClick={() => { setActiveTab(tab); if (tone) { setNewTone(tone); if (topic) setNewTopic(topic); }}}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: "8px 0", cursor: "pointer", color: C.text, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${C.border}`, textAlign: "left" }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={S.sideCard}>
              <div style={S.sideTitle}>🚦 Setup Checklist</div>
              {[
                [true, "Google account created"],
                [true, "Google Sheet Brain created"],
                [true, "Apps Script deployed"],
                [true, "Sheet connected ✅"],
                [!!apiKey, "OpenAI key → Settings"],
                [false, "Create X EN account"],
                [false, "Create X AR account"],
                [false, "X Developer API keys"],
                [false, "GitHub + Vercel accounts"],
                [false, "Regenerate Google key (last)"],
              ].map(([done, label], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  <span>{done ? "✅" : "⬜"}</span>
                  <span style={{ color: done ? C.text : C.textMuted }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
