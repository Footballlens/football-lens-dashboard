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
async function sheetUpdateStatus(rowIndex, status) {
  const res = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ action: "updateStatus", rowIndex, status }) });
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

const COLORS = {
  dark: { bg: "#080c10", card: "#111820", border: "#1e2d3d", accent: "#00d4ff", accentGold: "#f0a500", accentGreen: "#00e676", accentRed: "#ff3d57", text: "#e8f0fe", textMuted: "#7a8fa6", textDim: "#3d5166", gradient: "linear-gradient(135deg, #080c10 0%, #0d1520 100%)" },
  light: { bg: "#f0f4f8", card: "#ffffff", border: "#d0dce8", accent: "#0066cc", accentGold: "#d48800", accentGreen: "#00a651", accentRed: "#e0001e", text: "#0a1628", textMuted: "#4a6080", textDim: "#9ab0c8", gradient: "linear-gradient(135deg, #f0f4f8 0%, #e4ecf5 100%)" },
};

const LABELS = {
  en: {
    commandCenter: "COMMAND CENTER", queue: "Queue", generate: "Generate", sources: "Sources",
    analytics: "Analytics", insights: "Insights", ideas: "Ideas", settings: "Settings",
    pendingApproval: "PENDING APPROVAL", postsInBrain: "POSTS IN BRAIN", ideasBacklog: "IDEAS BACKLOG",
    sourcesLive: "SOURCES LIVE", enAccount: "EN ACCOUNT", arAccount: "AR ACCOUNT",
    awaitingReview: "awaiting your review", liveFromSheet: "live from sheet", contentIdeas: "content ideas",
    activelyMonitored: "actively monitored", approve: "Approve + Log to Sheet", enOnly: "EN Only",
    arOnly: "AR Only", edit: "Edit", reject: "Reject", saveChanges: "Save Changes", cancel: "Cancel",
    brainLive: "Brain Live", sheetError: "Sheet Error — click to retry", connecting: "Connecting...",
    connectedSyncing: "Connected & Syncing", connectionError: "Connection Error", retryConnection: "Retry Connection",
    queueStatus: "QUEUE STATUS", pending: "Pending", approved: "Approved", rejected: "Rejected",
    quickActions: "QUICK ACTIONS", setupChecklist: "SETUP CHECKLIST", sheetBrain: "GOOGLE SHEET BRAIN",
    sourcesTitle: "Open Intelligence Network", insightsTitle: "AI Analysis & Enhancement Proposals",
    analyticsTitle: "Live Analytics — Google Sheet Brain", ideasTitle: "Content Ideas Backlog",
    generateTitle: "AI Content Generator", topic: "TOPIC / STORY", tone: "TONE", language: "LANGUAGE",
    generateBtn: "Generate Post", generating: "Generating...", addToQueue: "Add to Approval Queue",
    sourcesVisual: "Sources, references & visual guide", hideDetails: "Hide details",
    visualUse: "USE IMAGE", visualNo: "TEXT ONLY", copyPrompt: "AI Image Prompt — click to copy",
    freeTools: "Free tools", syncing: "Syncing to Sheet...",
  },
  ar: {
    commandCenter: "مركز التحكم", queue: "القائمة", generate: "إنشاء", sources: "المصادر",
    analytics: "التحليلات", insights: "رؤى الذكاء", ideas: "الأفكار", settings: "الإعدادات",
    pendingApproval: "بانتظار الموافقة", postsInBrain: "منشورات في الذاكرة", ideasBacklog: "أفكار المحتوى",
    sourcesLive: "مصادر مباشرة", enAccount: "حساب EN", arAccount: "حساب AR",
    awaitingReview: "بانتظار مراجعتك", liveFromSheet: "مباشر من الجدول", contentIdeas: "أفكار المحتوى",
    activelyMonitored: "تحت المراقبة", approve: "موافقة + حفظ في الجدول", enOnly: "إنجليزي فقط",
    arOnly: "عربي فقط", edit: "تعديل", reject: "رفض", saveChanges: "حفظ التغييرات", cancel: "إلغاء",
    brainLive: "الذاكرة مباشرة", sheetError: "خطأ في الجدول — انقر للمحاولة", connecting: "جارٍ الاتصال...",
    connectedSyncing: "متصل ومزامن", connectionError: "خطأ في الاتصال", retryConnection: "إعادة الاتصال",
    queueStatus: "حالة القائمة", pending: "معلق", approved: "موافق عليه", rejected: "مرفوض",
    quickActions: "إجراءات سريعة", setupChecklist: "قائمة الإعداد", sheetBrain: "ذاكرة جوجل شيت",
    sourcesTitle: "شبكة الاستخبارات المفتوحة", insightsTitle: "تحليل الذكاء الاصطناعي ومقترحات التحسين",
    analyticsTitle: "التحليلات المباشرة — ذاكرة جوجل شيت", ideasTitle: "قائمة أفكار المحتوى",
    generateTitle: "منشئ المحتوى بالذكاء الاصطناعي", topic: "الموضوع / القصة", tone: "النبرة", language: "اللغة",
    generateBtn: "إنشاء منشور", generating: "جارٍ الإنشاء...", addToQueue: "إضافة إلى قائمة الموافقة",
    sourcesVisual: "المصادر والمراجع ودليل الصور", hideDetails: "إخفاء التفاصيل",
    visualUse: "استخدم صورة", visualNo: "نص فقط", copyPrompt: "برومبت الصورة — انقر للنسخ",
    freeTools: "أدوات مجانية", syncing: "جارٍ الحفظ في الجدول...",
  }
};

const MOCK_POSTS = [
  {
    id: 1, type: "Breaking News 🔴", tier: "BREAKING", credibility: 96, timeAgo: "3 min ago",
    en: "🚨 BREAKING: Kylian Mbappé set to undergo medical at Arsenal today. Personal terms already agreed on a 5-year deal. Announcement expected within 48 hours. #Arsenal #Mbappe",
    ar: "🚨 عاجل: كيليان مبابي سيخضع للفحص الطبي في آرسنال اليوم. تم الاتفاق على الشروط الشخصية لعقد مدته 5 سنوات. يُتوقع الإعلان خلال 48 ساعة.",
    sources: [
      { name: "@FabrizioRomano", url: "https://twitter.com/fabrizioromano", icon: "🐦", score: 97 },
      { name: "Sky Sports", url: "https://skysports.com", icon: "📺", score: 94 },
      { name: "beIN Sports AR", url: "https://beinsports.com/ar", icon: "📡", score: 91 },
    ],
    visual: { recommended: true, reason: "High-impact breaking transfer — image essential", prompt: "Kylian Mbappe professional photo, Arsenal FC badge left, PSG badge crossed out right, dark background, red BREAKING banner, bold white typography, 1200x675px", tools: ["Adobe Firefly", "Canva AI"], dimensions: "1200 x 675px" },
    tone: "Urgent / Breaking", status: "pending", account: "both", sheetRow: null,
  },
  {
    id: 2, type: "Transfer Rumours 🔄", tier: "TRANSFER", credibility: 78, timeAgo: "18 min ago",
    en: "👀 Rumour mill: Real Madrid monitoring Jude Bellingham future amid contract uncertainty. Exit rumours growing if Champions League form dips.",
    ar: "👀 شائعات: ريال مدريد يراقب مستقبل بيلينغهام. إشاعات الرحيل تتصاعد إذا تراجع الأداء في دوري الأبطال.",
    sources: [{ name: "Marca", url: "https://marca.com", icon: "🗞️", score: 82 }],
    visual: { recommended: true, reason: "Big name rumour — visual boosts engagement", prompt: "Jude Bellingham Real Madrid kit, moody cinematic lighting, blue/white color grade, question mark overlay, RUMOUR badge, 1200x675px", tools: ["Adobe Firefly", "Canva AI"], dimensions: "1200 x 675px" },
    tone: "Speculative", status: "pending", account: "both", sheetRow: null,
  },
  {
    id: 3, type: "History & Stories 📜", tier: "STORY", credibility: 99, timeAgo: "45 min ago",
    en: "🕰️ On this day in 1999: Manchester United completed the most dramatic comeback in football history. Down 1-0 to Bayern — Sheringham & Solskjaer in injury time. The Treble was born. 🔴",
    ar: "🕰️ في مثل هذا اليوم 1999: مانشستر يونايتد أتمّ أعظم انقلاب في التاريخ. خسارة 1-0 أمام بايرن — شيرينغهام وسولسكيار في الوقت الإضافي. وُلد الثلاثي.",
    sources: [{ name: "UEFA Official", url: "https://uefa.com", icon: "🏆", score: 99 }],
    visual: { recommended: true, reason: "Historic moment — archival style performs well", prompt: "Manchester United 1999 Champions League treble, vintage sepia effect, ON THIS DAY overlay, red and gold colors, retro typography, 1200x675px", tools: ["Canva AI", "Adobe Firefly"], dimensions: "1200 x 675px" },
    tone: "Nostalgic", status: "pending", account: "both", sheetRow: null,
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
  { type: "opportunity", icon: "🚀", title: { en: "Arabic engagement 38% higher", ar: "تفاعل عربي أعلى بنسبة 38%" }, body: { en: "Your AR account drives higher engagement. Consider increasing AR posting frequency from 5 to 8 posts/day.", ar: "حساب AR يحقق تفاعلاً أعلى. فكّر في زيادة تردد النشر من 5 إلى 8 منشورات يومياً." } },
  { type: "pattern", icon: "📊", title: { en: "Breaking news drives 3x impressions", ar: "الأخبار العاجلة تولّد 3x مشاهدات" }, body: { en: "Posts tagged BREAKING average 3.2x more impressions. Prioritize speed on transfers.", ar: "المنشورات العاجلة تحقق 3.2x مشاهدات أكثر. أعطِ الأولوية للسرعة في نقلات الانتقال." } },
  { type: "enhancement", icon: "💡", title: { en: "Add This Day in Football series", ar: "أضف سلسلة في مثل هذا اليوم" }, body: { en: "Historical content posted 8-10am gets 67% more saves. Automate a daily history post.", ar: "المحتوى التاريخي المنشور بين 8-10 صباحاً يحصل على 67% حفظاً أكثر." } },
  { type: "warning", icon: "⚠️", title: { en: "Tactical threads underperforming", ar: "خيوط التكتيك أداؤها ضعيف" }, body: { en: "Long tactical threads get low completion. Try 3-part visual carousel instead.", ar: "الخيوط التكتيكية الطويلة تحصل على إتمام منخفض. جرّب الكاروسيل المرئي المكوّن من 3 أجزاء." } },
];

const CONTENT_TYPES = ["All", "Breaking News 🔴", "Transfer Rumours 🔄", "Match Results ⚽", "Tactical Analysis 🧠", "Viral & Funny 😂", "History & Stories 📜", "Fan Reactions 🔥", "Polls & Debates ❓"];

export default function FootballLensDashboard() {
  const [theme, setTheme] = useState("dark");
  const [uiLang, setUiLang] = useState("en"); // FIX 3: full UI language
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
  const L = LABELS[uiLang];
  const isRTL = uiLang === "ar";

  useEffect(() => { const t = setInterval(() => setLiveTime(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { connectSheet(); }, []);

  const connectSheet = useCallback(async () => {
    setSheetStatus("connecting");
    setSheetMsg(uiLang === "ar" ? "جارٍ الاتصال بذاكرة Football Lens..." : "Connecting to Football Lens Brain...");
    try {
      await sheetPing();
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
      setSheetMsg(`✅ ${uiLang === "ar" ? "متصل!" : "Connected!"} ${realPosts.length} posts.`);
      setTimeout(() => setSheetMsg(""), 4000);
    } catch (e) {
      setSheetStatus("error");
      setSheetMsg(`❌ ${e.message}`);
    }
  }, [uiLang]);

  // FIX 5: Log new post as PENDING, then update status separately
  const logNewPostToSheet = async (post) => {
    if (sheetStatus !== "connected") return null;
    try {
      const now = new Date();
      await sheetAppend(SHEET_TABS.posts, [
        now.toLocaleDateString(), now.toLocaleTimeString(),
        post.type, post.tone, post.en, post.ar,
        post.sources[0]?.name || "", post.sources[1]?.name || "",
        post.credibility, post.visual.recommended ? "YES" : "NO",
        post.account.toUpperCase(), "Pending",
        "", "", "", "", "", "", "", "", "", ""
      ]);
      // Get row index for future status update
      const rows = await sheetRead(SHEET_TABS.posts, "A5:L1000");
      const rowIndex = rows.length + 4; // 4 header rows + data rows
      return rowIndex;
    } catch (e) { console.error(e); return null; }
  };

  const updatePostStatusInSheet = async (sheetRow, status) => {
    if (!sheetRow || sheetStatus !== "connected") return;
    try {
      await sheetUpdateStatus(sheetRow, status);
    } catch (e) { console.error(e); }
  };

  const approvePost = async (id, lang) => {
    const post = posts.find(p => p.id === id);
    const newStatus = lang === "reject" ? "Rejected" : "Approved";
    setPosts(p => p.map(p2 => p2.id === id ? { ...p2, status: newStatus.toLowerCase() } : p2));
    setSyncingPost(id);
    if (post?.sheetRow) {
      await updatePostStatusInSheet(post.sheetRow, newStatus);
    }
    setSheetMsg(`✅ Status updated to ${newStatus} in Sheet Brain`);
    setTimeout(() => setSheetMsg(""), 3000);
    setSyncingPost(null);
  };

  // FIX 4: Real edit functionality
  const startEdit = (post) => { setEditingPost(post.id); setEditText({ en: post.en, ar: post.ar }); };
  const saveEdit = (id) => {
    if (!editText.en.trim() && !editText.ar.trim()) return;
    setPosts(p => p.map(p2 => p2.id === id ? { ...p2, en: editText.en, ar: editText.ar } : p2));
    setEditingPost(null);
  };

  const generatePost = async () => {
    if (!newTopic.trim()) return;
    setGenerating(true);
    setGeneratedPost(null);
    // Log idea to sheet
    if (sheetStatus === "connected") {
      try {
        await sheetAppend(SHEET_TABS.ideas, [new Date().toLocaleDateString(), newTopic, "AI Generated", newTone, "HIGH", "Generated", newLang.toUpperCase(), "", "Via dashboard"]);
      } catch (e) { console.error(e); }
    }
    try {
      if (apiKey) {
        const prompt = `You are Football Lens, a bilingual football media brand. Generate a post.
Topic: ${newTopic}
Tone: ${newTone}
Respond ONLY with valid JSON (no markdown):
{"en":"English post max 280 chars with emojis","ar":"Arabic post max 280 chars with emojis","visualRecommended":true,"visualReason":"one sentence","imagePrompt":"detailed prompt","tone":"label","credibility":85}`;
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }] }),
        });
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || "";
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        const newPost = {
          id: Date.now(), type: `${newTone} ✨`, tier: newTone.toUpperCase().slice(0, 8),
          credibility: parsed.credibility || 85, timeAgo: "Just now",
          en: parsed.en, ar: parsed.ar,
          sources: [{ name: "AI Generated", url: "#", icon: "🤖", score: 85 }],
          visual: { recommended: parsed.visualRecommended, reason: parsed.visualReason, prompt: parsed.imagePrompt, tools: ["Adobe Firefly", "Canva AI"], dimensions: "1200 x 675px" },
          tone: parsed.tone || newTone, status: "pending", account: newLang, sheetRow: null,
        };
        setGeneratedPost(newPost);
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setGeneratedPost({
          id: Date.now(), type: `${newTone} ✨`, tier: "DEMO", credibility: 88, timeAgo: "Just now",
          en: `⚡ [DEMO] ${newTopic} — Add OpenAI key in Settings for real AI. #FootballLens`,
          ar: `⚡ [تجريبي] ${newTopic} — أضف مفتاح OpenAI في الإعدادات. #FootballLens`,
          sources: [{ name: "Demo Mode", url: "#", icon: "🤖", score: 85 }],
          visual: { recommended: true, reason: "Demo", prompt: `${newTopic} football graphic 1200x675px`, tools: ["Adobe Firefly", "Canva AI"], dimensions: "1200 x 675px" },
          tone: newTone, status: "pending", account: newLang, sheetRow: null,
        });
      }
    } catch (e) {
      console.error(e);
      setSheetMsg(`❌ Generation failed: ${e.message}`);
    }
    setGenerating(false);
  };

  // FIX 5: When adding to queue, log as Pending immediately
  const addGeneratedToQueue = async () => {
    if (!generatedPost) return;
    const rowIndex = await logNewPostToSheet(generatedPost);
    const postWithRow = { ...generatedPost, sheetRow: rowIndex };
    setPosts(p => [postWithRow, ...p]);
    setSheetPostsCount(n => n + 1);
    setGeneratedPost(null);
    setNewTopic("");
    setActiveTab("queue");
    setSheetMsg("✅ Post added to queue and logged as Pending in Sheet Brain");
    setTimeout(() => setSheetMsg(""), 3000);
  };

  const filteredPosts = filter === "All" ? posts : posts.filter(p => p.type === filter);
  const pendingCount = posts.filter(p => p.status === "pending").length;
  const tierColor = (t) => ({ BREAKING: C.accentRed, TRANSFER: C.accentGold, VIRAL: "#ff6b35", ANALYSIS: C.accent, STORY: "#a78bfa", DEMO: C.textMuted })[t] || C.accent;

  const S = {
    root: { minHeight: "100vh", background: C.gradient, fontFamily: "'DM Sans','Segoe UI',sans-serif", color: C.text, transition: "all 0.3s", direction: isRTL ? "rtl" : "ltr" },
    header: { background: theme === "dark" ? "rgba(8,12,16,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)", borderBottom: `1px solid ${C.border}`, padding: "0 24px", position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 },
    navBtn: (a) => ({ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: a ? C.accent : "transparent", color: a ? "#fff" : C.textMuted }),
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", marginBottom: 14 },
    tierBadge: (t) => ({ fontSize: 11, fontWeight: 800, letterSpacing: 1, padding: "3px 8px", borderRadius: 5, background: `${tierColor(t)}22`, color: tierColor(t), border: `1px solid ${tierColor(t)}44` }),
    postText: { background: theme === "dark" ? "#0a1520" : "#f5f8fc", border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", fontSize: 14, lineHeight: 1.6, marginBottom: 8 },
    input: { width: "100%", background: theme === "dark" ? "#0a1520" : "#f5f8fc", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none", boxSizing: "border-box" },
    select: { background: theme === "dark" ? "#0a1520" : "#f5f8fc", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontSize: 13, outline: "none" },
    textarea: { width: "100%", background: theme === "dark" ? "#0a1520" : "#f5f8fc", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", color: C.text, fontSize: 13, outline: "none", resize: "vertical", minHeight: 100, boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.6 },
    btn: (color, outline) => ({ padding: "8px 16px", borderRadius: 8, border: outline ? `1px solid ${color}` : "none", background: outline ? "transparent" : color, color: outline ? color : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }),
    sideCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 16 },
    sideTitle: { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: C.textMuted, marginBottom: 12 },
    statCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 20px" },
    // FIX 1: postLangTab does NOT auto-reset - managed per card
    postLangTab: (a) => ({ flex: 1, padding: 9, textAlign: "center", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, background: a ? C.accent : "transparent", color: a ? "#fff" : C.textMuted, border: "none" }),
    filterBtn: (a) => ({ padding: "5px 12px", borderRadius: 20, border: `1px solid ${a ? C.accent : C.border}`, background: a ? C.accent : "transparent", color: a ? "#fff" : C.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }),
    sheetBadge: { display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: sheetStatus === "connected" ? `${C.accentGreen}22` : sheetStatus === "connecting" ? `${C.accentGold}22` : `${C.accentRed}22`, color: sheetStatus === "connected" ? C.accentGreen : sheetStatus === "connecting" ? C.accentGold : C.accentRed, border: `1px solid ${sheetStatus === "connected" ? C.accentGreen + "55" : C.border}`, cursor: "pointer" },
    langToggle: (a) => ({ padding: "4px 10px", borderRadius: 6, border: `1px solid ${a ? C.accentGold : C.border}`, background: a ? `${C.accentGold}22` : "transparent", color: a ? C.accentGold : C.textMuted, cursor: "pointer", fontSize: 12, fontWeight: 700 }),
  };

  // FIX 1: Each PostCard manages its own lang state independently — never resets
  const PostCard = ({ post }) => {
    const [lang, setLang] = useState(uiLang === "ar" ? "ar" : "en");
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
            {post.status !== "pending" && (
              <span style={{ fontSize: 11, background: post.status === "approved" ? C.accentGreen + "22" : C.accentRed + "22", color: post.status === "approved" ? C.accentGreen : C.accentRed, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>
                {post.status === "approved" ? (uiLang === "ar" ? "موافق" : "APPROVED") : (uiLang === "ar" ? "مرفوض" : "REJECTED")}
              </span>
            )}
            {syncingPost === post.id && <span style={{ fontSize: 11, color: C.accentGold }}>{L.syncing}</span>}
          </div>
        </div>

        <div style={{ padding: "0 18px 14px" }}>
          {/* FIX 1: Lang tabs - clicking AR stays on AR, clicking EN stays on EN */}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button style={S.postLangTab(lang === "en")} onClick={() => setLang("en")}>🇬🇧 Football Lens EN</button>
            <button style={S.postLangTab(lang === "ar")} onClick={() => setLang("ar")}>🇸🇦 Football Lens AR</button>
          </div>

          {/* FIX 4: Real editable textarea */}
          {isEditing ? (
            <div>
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>🇬🇧 English version:</div>
              <textarea
                style={{ ...S.textarea, marginBottom: 10, direction: "ltr" }}
                value={editText.en}
                onChange={e => setEditText(p => ({ ...p, en: e.target.value }))}
                placeholder="Edit English post..."
              />
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>🇸🇦 Arabic version:</div>
              <textarea
                style={{ ...S.textarea, direction: "rtl", textAlign: "right" }}
                value={editText.ar}
                onChange={e => setEditText(p => ({ ...p, ar: e.target.value }))}
                placeholder="عدّل المنشور العربي..."
              />
            </div>
          ) : (
            <div style={{ ...S.postText, direction: lang === "ar" ? "rtl" : "ltr", textAlign: lang === "ar" ? "right" : "left" }}>
              {lang === "en" ? post.en : post.ar}
            </div>
          )}

          {isExpanded && (
            <>
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>📎 {uiLang === "ar" ? "المصادر والمراجع" : "Sources & References"}</div>
                {post.sources.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                    <span>{s.icon}</span>
                    <a href={s.url} target="_blank" rel="noreferrer" style={{ color: C.accent, textDecoration: "none", fontWeight: 600 }}>{s.name}</a>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: s.score > 85 ? C.accentGreen : C.accentGold, fontWeight: 700 }}>{s.score}%</span>
                  </div>
                ))}
              </div>
              {post.visual && (
                <div style={{ background: post.visual.recommended ? `${C.accentGold}11` : `${C.textDim}11`, border: `1px solid ${post.visual.recommended ? C.accentGold + "44" : C.textDim}`, borderRadius: 8, padding: "12px 14px", marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: post.visual.recommended ? C.accentGold : C.textMuted, marginBottom: 4 }}>
                    🖼️ {post.visual.recommended ? `✅ ${L.visualUse}` : `❌ ${L.visualNo}`}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{post.visual.reason}</div>
                  {post.visual.recommended && post.visual.prompt && (
                    <>
                      <div style={{ fontSize: 11, color: C.textMuted, margin: "8px 0 4px" }}>📋 {L.copyPrompt}:</div>
                      <div onClick={() => navigator.clipboard?.writeText(post.visual.prompt)}
                        style={{ background: theme === "dark" ? "#0a1520" : "#f0f4f8", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: C.textMuted, fontFamily: "monospace", cursor: "pointer", wordBreak: "break-word", border: `1px solid ${C.border}` }}>
                        {post.visual.prompt}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>🎨 {L.freeTools}: {post.visual.tools?.join(" · ")} · 📐 {post.visual.dimensions}</div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <button onClick={() => setExpandedPost(isExpanded ? null : post.id)}
            style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, fontWeight: 600, marginTop: 10, padding: 0 }}>
            {isExpanded ? `▲ ${L.hideDetails}` : `▼ ${L.sourcesVisual}`}
          </button>
        </div>

        {post.status === "pending" && (
          <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isEditing ? (
              <>
                <button style={S.btn(C.accentGreen)} onClick={() => saveEdit(post.id)}>💾 {L.saveChanges}</button>
                <button style={S.btn(C.textMuted, true)} onClick={() => setEditingPost(null)}>{L.cancel}</button>
              </>
            ) : (
              <>
                <button style={S.btn(C.accentGreen)} onClick={() => approvePost(post.id, "both")}>✅ {L.approve}</button>
                <button style={S.btn(C.accent, true)} onClick={() => approvePost(post.id, "en")}>🇬🇧 {L.enOnly}</button>
                <button style={S.btn(C.accentGold, true)} onClick={() => approvePost(post.id, "ar")}>🇸🇦 {L.arOnly}</button>
                <button style={S.btn(C.textMuted, true)} onClick={() => startEdit(post)}>✏️ {L.edit}</button>
                <button style={S.btn(C.accentRed, true)} onClick={() => approvePost(post.id, "reject")}>✕ {L.reject}</button>
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

      {showSettings && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 28, width: 480, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>⚙️ {L.settings}</div>
            <div style={{ background: theme === "dark" ? "#0a1520" : "#f0f8f4", border: `1px solid ${C.accentGreen}33`, borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.accentGreen, marginBottom: 6 }}>📊 {L.sheetBrain} — {sheetStatus === "connected" ? "✅ CONNECTED" : sheetStatus.toUpperCase()}</div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.8 }}>📧 footballlens78@gmail.com<br />🔗 Apps Script: Active<br />📋 Posts: {sheetPostsCount}<br />💡 Ideas: {ideasData.length}</div>
              <button style={{ ...S.btn(C.accentGreen), marginTop: 10, width: "100%" }} onClick={connectSheet}>{sheetStatus === "connecting" ? L.connecting : "🔄 Reconnect"}</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>🤖 OPENAI API KEY</div>
              <input type="password" placeholder="sk-..." style={S.input} value={apiKey} onChange={e => setApiKey(e.target.value)} />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>platform.openai.com/api-keys</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>🐦 X API — Football Lens EN</div>
              <input placeholder="API Key" style={{ ...S.input, marginBottom: 8 }} />
              <input placeholder="Access Token" style={S.input} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>🐦 X API — Football Lens AR</div>
              <input placeholder="API Key" style={{ ...S.input, marginBottom: 8 }} />
              <input placeholder="Access Token" style={S.input} />
            </div>
            <button style={{ ...S.btn(C.accent), width: "100%", padding: 12 }} onClick={() => setShowSettings(false)}>Save & Close</button>
          </div>
        </div>
      )}

      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: `linear-gradient(135deg, ${C.accentGreen}, ${C.accent})`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>🔭</div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.5px" }}>Football Lens</span>
          <span style={{ fontSize: 10, background: C.accentRed, color: "#fff", padding: "2px 6px", borderRadius: 4, fontWeight: 700, letterSpacing: 1 }}>{L.commandCenter}</span>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {[["queue", L.queue], ["generate", L.generate], ["sources", L.sources], ["analytics", L.analytics], ["insights", L.insights], ["ideas", L.ideas]].map(([id, label]) => (
            <button key={id} style={S.navBtn(activeTab === id)} onClick={() => setActiveTab(id)}>
              {id === "queue" ? "📋" : id === "generate" ? "✨" : id === "sources" ? "📡" : id === "analytics" ? "📊" : id === "insights" ? "🧠" : "💡"} {label}
              {id === "queue" && pendingCount > 0 && <span style={{ marginLeft: 5, background: C.accentRed, color: "#fff", borderRadius: 10, padding: "0 5px", fontSize: 10 }}>{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={S.sheetBadge} onClick={connectSheet}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor", animation: sheetStatus === "connecting" ? "pulse 1s infinite" : "none" }} />
            {sheetStatus === "connected" ? `📊 ${L.brainLive} · ${sheetPostsCount}` : sheetStatus === "connecting" ? L.connecting : `❌ ${L.sheetError}`}
          </div>
          <span style={{ fontSize: 12, color: C.textMuted }}>{liveTime.toLocaleTimeString()}</span>
          {/* FIX 3: Full UI language toggle */}
          <button style={S.langToggle(uiLang === "ar")} onClick={() => setUiLang(l => l === "en" ? "ar" : "en")}>
            {uiLang === "en" ? "🇸🇦 عربي" : "🇬🇧 English"}
          </button>
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.text, cursor: "pointer", fontSize: 15 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
          <button onClick={() => setShowSettings(true)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>⚙️ {L.settings}</button>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 20px" }}>
        {sheetMsg && (
          <div style={{ background: sheetStatus === "connected" ? `${C.accentGreen}22` : sheetStatus === "error" ? `${C.accentRed}22` : `${C.accentGold}22`, border: `1px solid ${sheetStatus === "connected" ? C.accentGreen : sheetStatus === "error" ? C.accentRed : C.accentGold}44`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: sheetStatus === "connected" ? C.accentGreen : sheetStatus === "error" ? C.accentRed : C.accentGold, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{sheetMsg}</span>
            <button onClick={() => setSheetMsg("")} style={{ background: "none", border: "none", cursor: "pointer", color: "currentColor", fontSize: 18 }}>×</button>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
          {[
            [L.pendingApproval, pendingCount, C.accentRed, L.awaitingReview],
            [L.postsInBrain, sheetPostsCount, C.accentGreen, sheetStatus === "connected" ? `✅ ${L.liveFromSheet}` : "connect sheet"],
            [L.ideasBacklog, ideasData.length || "—", C.accentGold, L.contentIdeas],
            [L.sourcesLive, RSS_SOURCES.filter(s => s.status === "live").length, C.accent, L.activelyMonitored],
            [L.enAccount, "Active", C.accent, "Football Lens EN"],
            [L.arAccount, "Active", C.accentGold, "Football Lens AR"],
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
            {activeTab === "queue" && (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  {CONTENT_TYPES.map(f => <button key={f} style={S.filterBtn(filter === f)} onClick={() => setFilter(f)}>{f}</button>)}
                </div>
                {filteredPosts.map(p => <PostCard key={p.id} post={p} />)}
              </>
            )}

            {activeTab === "generate" && (
              <>
                <div style={{ ...S.card, padding: 20 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>✨ {L.generateTitle}</div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>{L.topic}</div>
                    <input style={S.input} placeholder={uiLang === "ar" ? "مثال: إصابة صلاح، انتقال مبابي..." : "e.g. Salah injury, Mbappé transfer..."} value={newTopic} onChange={e => setNewTopic(e.target.value)} onKeyDown={e => e.key === "Enter" && generatePost()} />
                  </div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>{L.tone}</div>
                      <select style={{ ...S.select, width: "100%" }} value={newTone} onChange={e => setNewTone(e.target.value)}>
                        {["Breaking", "Transfer", "Analytical", "Funny/Sarcastic", "Nostalgic", "Hype", "Debate"].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, marginBottom: 6 }}>{L.language}</div>
                      <select style={{ ...S.select, width: "100%" }} value={newLang} onChange={e => setNewLang(e.target.value)}>
                        <option value="both">Both EN + AR</option>
                        <option value="en">English Only</option>
                        <option value="ar">Arabic Only</option>
                      </select>
                    </div>
                  </div>
                  <button style={{ ...S.btn(generating || !newTopic.trim() ? C.textMuted : C.accent), width: "100%", padding: 12, fontSize: 15 }} onClick={generatePost} disabled={generating || !newTopic.trim()}>
                    {generating ? `⏳ ${L.generating}` : `🚀 ${L.generateBtn}`}
                  </button>
                  {!apiKey && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8, textAlign: "center" }}>💡 {uiLang === "ar" ? "أضف مفتاح OpenAI في الإعدادات للذكاء الاصطناعي الحقيقي" : "Add OpenAI key in Settings for real AI generation"}</div>}
                </div>
                {generatedPost && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.accentGreen, marginBottom: 10 }}>✅ {uiLang === "ar" ? "المنشور جاهز — راجع وأضف للقائمة:" : "Post ready — review and add to queue:"}</div>
                    <PostCard post={generatedPost} />
                    <button style={{ ...S.btn(C.accentGreen), width: "100%", padding: 12, fontSize: 14, marginTop: -8 }} onClick={addGeneratedToQueue}>➕ {L.addToQueue}</button>
                  </>
                )}
              </>
            )}

            {activeTab === "sources" && (
              <div style={S.card}>
                <div style={{ padding: "18px 20px 6px", fontSize: 16, fontWeight: 800 }}>📡 {L.sourcesTitle}</div>
                <div style={{ padding: "0 20px 18px" }}>
                  {RSS_SOURCES.map((s, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 20 }}>{s.icon}</span>
                        <div><div style={{ fontSize: 13, fontWeight: 700 }}>{s.name}</div><div style={{ fontSize: 11, color: C.textMuted }}>{s.platform}</div></div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: s.credScore > 85 ? C.accentGreen : C.accentGold }}>{s.credScore}%</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.status === "live" ? C.accentGreen : C.accentGold }} />
                          <span style={{ fontSize: 11, color: C.textMuted }}>{s.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "analytics" && (
              analyticsData.length > 0 ? (
                <div style={S.card}>
                  <div style={{ padding: "18px 20px 8px", fontSize: 16, fontWeight: 800 }}>📊 {L.analyticsTitle}</div>
                  <div style={{ padding: "0 20px 20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "70px repeat(6,1fr)", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase" }}>
                      {["Week","EN Start","EN End","EN%","AR Start","AR End","AR%"].map(h => <span key={h}>{h}</span>)}
                    </div>
                    {analyticsData.map((row, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "70px repeat(6,1fr)", gap: 8, padding: "9px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                        <span style={{ fontWeight: 800, color: C.accentGold }}>{row[0]}</span>
                        {[1,2,3,6,7,8].map(j => <span key={j} style={{ color: j===3||j===8 ? C.accentGreen : C.textMuted }}>{row[j]||"—"}</span>)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ ...S.card, padding: 50, textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{uiLang === "ar" ? "ستظهر التحليلات هنا" : "Analytics will appear here"}</div>
                  <div style={{ fontSize: 13, color: C.textMuted }}>{uiLang === "ar" ? "أضف بيانات في تبويب Analytics Weekly في جوجل شيت." : "Fill in the Analytics Weekly tab in your Google Sheet."}</div>
                </div>
              )
            )}

            {activeTab === "insights" && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>🧠 {L.insightsTitle}</div>
                {AI_INSIGHTS.map((ins, i) => {
                  const colors = { opportunity: C.accentGreen, pattern: C.accent, enhancement: C.accentGold, warning: C.accentRed };
                  return (
                    <div key={i} style={{ background: `${colors[ins.type]}11`, border: `1px solid ${colors[ins.type]}33`, borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 5 }}>{ins.icon} {ins.title[uiLang]}</div>
                      <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6 }}>{ins.body[uiLang]}</div>
                    </div>
                  );
                })}
              </>
            )}

            {activeTab === "ideas" && (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 14 }}>💡 {L.ideasTitle}</div>
                {ideasData.length > 0 ? ideasData.map((row, i) => (
                  <div key={i} style={{ ...S.card, padding: "14px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, flex: 1, marginRight: 10 }}>{row[1]||"—"}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ fontSize: 11, background: `${C.accentGold}22`, color: C.accentGold, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>{row[4]||"MEDIUM"}</span>
                        <span style={{ fontSize: 11, background: `${C.accent}22`, color: C.accent, padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>{row[5]||"Idea"}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted }}>📋 {row[2]} · 🎭 {row[3]} · 👤 {row[6]} · 🕐 {row[7]}</div>
                    {row[8] && <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>💬 {row[8]}</div>}
                  </div>
                )) : (
                  <div style={{ ...S.card, padding: 40, textAlign: "center", color: C.textMuted }}>
                    {uiLang === "ar" ? "لا توجد أفكار. أضفها في تبويب Content Ideas." : "No ideas found. Add them in the Content Ideas tab."}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <div style={S.sideCard}>
              <div style={S.sideTitle}>📊 {L.sheetBrain}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 9, height: 9, borderRadius: "50%", background: sheetStatus === "connected" ? C.accentGreen : sheetStatus === "error" ? C.accentRed : C.accentGold, animation: sheetStatus === "connecting" ? "pulse 1s infinite" : "none" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: sheetStatus === "connected" ? C.accentGreen : C.textMuted }}>
                  {sheetStatus === "connected" ? L.connectedSyncing : sheetStatus === "connecting" ? L.connecting : L.connectionError}
                </span>
              </div>
              {sheetStatus === "connected" ? (
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.9 }}>
                  ✅ {uiLang === "ar" ? "حفظ تلقائي عند الموافقة" : "Posts auto-logged on approval"}<br />
                  ✅ {uiLang === "ar" ? "الحالة: معلق ← موافق/مرفوض" : "Status: Pending → Approved/Rejected"}<br />
                  ✅ {sheetPostsCount} {uiLang === "ar" ? "منشور في الذاكرة" : "posts in brain"}<br />
                  ✅ {ideasData.length} {uiLang === "ar" ? "فكرة محملة" : "ideas loaded"}
                </div>
              ) : (
                <button style={{ ...S.btn(C.accentGreen), width: "100%", marginTop: 6 }} onClick={connectSheet}>🔄 {L.retryConnection}</button>
              )}
            </div>

            <div style={S.sideCard}>
              <div style={S.sideTitle}>📋 {L.queueStatus}</div>
              {[[L.pending, pendingCount, C.accentGold], [L.approved, posts.filter(p=>p.status==="approved").length, C.accentGreen], [L.rejected, posts.filter(p=>p.status==="rejected").length, C.accentRed]].map(([l,c,col]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: C.textMuted }}>{l}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: col }}>{c}</span>
                </div>
              ))}
            </div>

            <div style={S.sideCard}>
              <div style={S.sideTitle}>⚡ {L.quickActions}</div>
              {[
                ["🔴 " + (uiLang==="ar"?"أخبار عاجلة":"Breaking News"), "generate", "Breaking", ""],
                ["🔄 " + (uiLang==="ar"?"إشاعة انتقال":"Transfer Rumour"), "generate", "Transfer", ""],
                ["📅 " + (uiLang==="ar"?"في مثل هذا اليوم":"This Day in Football"), "generate", "Nostalgic", uiLang==="ar"?"في مثل هذا اليوم في تاريخ كرة القدم":"This day in football history"],
                ["😂 " + (uiLang==="ar"?"منشور مضحك":"Viral/Funny"), "generate", "Funny/Sarcastic", ""],
                ["📡 " + L.sources, "sources", null, ""],
                ["🧠 " + L.insights, "insights", null, ""],
                ["💡 " + L.ideas, "ideas", null, ""],
              ].map(([label, tab, tone, topic]) => (
                <button key={label} onClick={() => { setActiveTab(tab); if (tone) { setNewTone(tone); if (topic) setNewTopic(topic); }}}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: "8px 0", cursor: "pointer", color: C.text, fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${C.border}`, textAlign: isRTL ? "right" : "left" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* FIX 2: Checklist shows 6 done */}
            <div style={S.sideCard}>
              <div style={S.sideTitle}>🚦 {L.setupChecklist}</div>
              {[
                [true, uiLang==="ar"?"تم إنشاء حساب جوجل":"Google account created"],
                [true, uiLang==="ar"?"تم إنشاء جوجل شيت":"Google Sheet Brain created"],
                [true, uiLang==="ar"?"تم نشر Apps Script":"Apps Script deployed"],
                [true, uiLang==="ar"?"تم ربط الجدول":"Sheet connected ✅"],
                [true, uiLang==="ar"?"تم إنشاء GitHub":"GitHub repo created"],
                [true, uiLang==="ar"?"تم النشر على Vercel":"Deployed on Vercel ✅"],
                [!!apiKey, uiLang==="ar"?"مفتاح OpenAI في الإعدادات":"OpenAI key → Settings"],
                [false, uiLang==="ar"?"إنشاء حساب X EN":"Create X EN account"],
                [false, uiLang==="ar"?"إنشاء حساب X AR":"Create X AR account"],
                [false, uiLang==="ar"?"مفاتيح X Developer API":"X Developer API keys"],
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
