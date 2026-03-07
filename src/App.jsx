import React, { useState, useEffect, useCallback } from "react";

// ── CONFIG ────────────────────────────────────────────────────────────────────
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxDgz-Zxi989GzhscU7922WqJ1iVE1d4dALVkBcTP1cvfPSoYOfSW7UUKu2TkPxQxluxQ/exec";
const SHEET_TABS = { posts: "Posts Log", ideas: "Content Ideas", analytics: "Analytics Weekly" };
const SESSION_KEY = "fl_session"; // in-memory only (no localStorage)

// ── COLORS ────────────────────────────────────────────────────────────────────
const C = {
  bg:"#0b0f18", sidebar:"#0f1623", card:"#141c2e", border:"#1e2d45",
  accent:"#00d4ff", gold:"#f0a500", green:"#00e676", red:"#ff3d57", purple:"#a78bfa",
  text:"#e8f0fe", muted:"#7a8fa6", dim:"#3a4f66",
};

// ── SHEET API ─────────────────────────────────────────────────────────────────
async function sheetRead(tab, range = "A1:Z1000") {
  const res  = await fetch(`${APPS_SCRIPT_URL}?action=read&sheet=${encodeURIComponent(tab)}&range=${encodeURIComponent(range)}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Read failed");
  return data.data || [];
}
async function sheetPost(body) {
  const res  = await fetch(APPS_SCRIPT_URL, { method:"POST", headers:{"Content-Type":"text/plain"}, body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || "Post failed");
  return data;
}
const sheetAppend = (tab, row) => sheetPost({ action:"append", sheet:tab, row });
const sheetUpdateStatus = (tab, rowIndex, status, time, account) =>
  sheetPost({ action:"updateStatus", sheet:tab, rowIndex, status, postedTime:time, approvedAccount:account });
const sheetBatchUpdate = (updates) => sheetPost({ action:"batchUpdate", updates });
const sheetPing = () => fetch(`${APPS_SCRIPT_URL}?action=ping`).then(r=>r.json());

// ── ROW PARSER ────────────────────────────────────────────────────────────────
function rowToPost(row, sheetRow) {
  if (!row[4] && !row[5]) return null;
  if (!row[0] || row[0]==="Date") return null;
  const type = row[2] || "General";
  return {
    id:`r${sheetRow}`, sheetRow, date:row[0], time:row[1], type,
    tier: type.includes("Break")?"BREAKING":type.includes("Transfer")?"TRANSFER":type.includes("Histor")||type.includes("Story")?"STORY":type.includes("Funny")||type.includes("Viral")?"VIRAL":"GENERAL",
    tone:row[3]||"General", en:row[4]||"", ar:row[5]||"",
    src1:row[6]||"", src2:row[7]||"",
    credibility:parseInt(row[8])||80,
    visualRecommended:row[9]==="YES",
    account:(row[10]||"both").toLowerCase(),
    status:(row[11]||"pending").toLowerCase(),
    postedTime:row[12]||"",
    tweetId:row[14]||"",
    impressions:parseInt(row[15])||0,
    likes:parseInt(row[16])||0,
  };
}

function autoApproveLabel(post) {
  const type=(post.type||"").toLowerCase(), tone=(post.tone||"").toLowerCase();
  if (type.includes("break")||tone.includes("break")) return { label:"BREAKING — auto-approved", color:C.red };
  if (type.includes("transfer")||tone.includes("transfer")) return { label:"TRANSFER — auto-approved", color:C.gold };
  if (post.credibility>=95) return { label:"HIGH CRED — auto-approved", color:C.green };
  return null;
}

const DEFAULT_SOURCES = [
  { id:1, name:"@FabrizioRomano", url:"https://rss.nitter.net/FabrizioRomano/rss", type:"RSS", category:"Transfers", credScore:97, status:"active", icon:"🐦" },
  { id:2, name:"Sky Sports",      url:"https://www.skysports.com/rss/12040",        type:"RSS", category:"General",   credScore:94, status:"active", icon:"📺" },
  { id:3, name:"BBC Sport",       url:"https://feeds.bbci.co.uk/sport/football/rss.xml", type:"RSS", category:"General", credScore:95, status:"active", icon:"📻" },
  { id:4, name:"ESPN FC",         url:"https://www.espn.com/espn/rss/soccer/news",  type:"RSS", category:"General",   credScore:93, status:"active", icon:"🏟️" },
  { id:5, name:"beIN Sports AR",  url:"https://www.beinsports.com/ar",              type:"Web", category:"Arabic",    credScore:91, status:"active", icon:"📡" },
  { id:6, name:"UEFA Official",   url:"https://www.uefa.com/rssfeed/",              type:"RSS", category:"Official",  credScore:99, status:"active", icon:"🏆" },
  { id:7, name:"Goal.com",        url:"https://www.goal.com/feeds/en/news",         type:"RSS", category:"General",   credScore:89, status:"active", icon:"⚽" },
  { id:8, name:"Kooora",          url:"https://www.kooora.com",                     type:"Web", category:"Arabic",    credScore:87, status:"active", icon:"🌐" },
  { id:9, name:"FilGoal",         url:"https://www.filgoal.com",                    type:"Web", category:"Arabic",    credScore:86, status:"active", icon:"🌍" },
  { id:10,name:"@David_Ornstein", url:"https://rss.nitter.net/David_Ornstein/rss",  type:"RSS", category:"Transfers", credScore:96, status:"active", icon:"🐦" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function LoginScreen({ onAuth }) {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const requestLink = async () => {
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address"); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ email: email.trim() }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSent(true);
      // Dev mode: auto-verify if link returned
      if (data.devLink) {
        const token = new URL(data.devLink).searchParams.get("auth");
        if (token) verifyToken(token);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const verifyToken = async (token) => {
    try {
      const res  = await fetch("/api/auth/verify", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ token }) });
      const data = await res.json();
      if (data.valid) onAuth({ sessionToken: data.sessionToken, email: data.email, expiresAt: data.expiresAt });
      else setError(data.error || "Invalid or expired link");
    } catch (e) { setError("Verification failed — try again"); }
  };

  // Check URL for auth token on mount (magic link click)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("auth");
    if (token) {
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
      verifyToken(decodeURIComponent(token));
    }
  }, []);

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap'); *{box-sizing:border-box;margin:0;padding:0;}`}</style>
      <div style={{ width:"100%", maxWidth:420 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <div style={{ width:64, height:64, background:"linear-gradient(135deg,#00e676,#00d4ff)", borderRadius:16, display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:34, marginBottom:16 }}>🔭</div>
          <div style={{ fontSize:26, fontWeight:800, color:C.text, letterSpacing:"-0.5px" }}>Football Lens</div>
          <div style={{ fontSize:12, color:C.green, fontWeight:700, letterSpacing:2, marginTop:4 }}>AI MEDIA ENGINE</div>
        </div>

        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:32 }}>
          {!sent ? (
            <>
              <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:6 }}>Sign in</div>
              <div style={{ fontSize:13, color:C.muted, marginBottom:24, lineHeight:1.6 }}>
                Enter your email and we'll send you a secure magic link — no password needed.
              </div>

              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Email Address</div>
                <input
                  type="email"
                  style={{ width:"100%", background:"#070b14", border:`1px solid ${error ? C.red : C.border}`, borderRadius:10, padding:"12px 14px", color:C.text, fontSize:14, outline:"none", boxSizing:"border-box" }}
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={e => e.key==="Enter" && requestLink()}
                  autoFocus
                />
                {error && <div style={{ color:C.red, fontSize:12, marginTop:6 }}>⚠ {error}</div>}
              </div>

              <button
                onClick={requestLink}
                disabled={loading}
                style={{ width:"100%", padding:"13px 0", background: loading ? C.dim : "linear-gradient(135deg,#00e676,#00d4ff)", border:"none", borderRadius:10, color:"#000", fontSize:15, fontWeight:800, cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "⏳ Sending…" : "✉️ Send Magic Link"}
              </button>

              <div style={{ marginTop:20, padding:12, background:`${C.accent}0d`, border:`1px solid ${C.accent}33`, borderRadius:8 }}>
                <div style={{ fontSize:12, color:C.accent, fontWeight:700, marginBottom:4 }}>🔒 How it works</div>
                <div style={{ fontSize:12, color:C.muted, lineHeight:1.7 }}>
                  1. Enter your registered email<br/>
                  2. Click the link in your inbox<br/>
                  3. You're in — no password, no SMS<br/>
                  4. Session lasts 24 hours
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign:"center", padding:"10px 0" }}>
              <div style={{ fontSize:48, marginBottom:16 }}>📬</div>
              <div style={{ fontSize:18, fontWeight:800, color:C.text, marginBottom:8 }}>Check your inbox</div>
              <div style={{ fontSize:13, color:C.muted, lineHeight:1.7, marginBottom:24 }}>
                We sent a magic link to<br/>
                <strong style={{ color:C.accent }}>{email}</strong><br/>
                Link expires in <strong style={{ color:C.gold }}>10 minutes</strong>
              </div>
              <div style={{ padding:14, background:`${C.gold}0d`, border:`1px solid ${C.gold}33`, borderRadius:10, fontSize:13, color:C.muted, marginBottom:20 }}>
                📱 Check spam if you don't see it.<br/>The email comes from <strong>noreply@footballlens.ai</strong>
              </div>
              <button onClick={() => { setSent(false); setEmail(""); }} style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 20px", color:C.muted, cursor:"pointer", fontSize:13 }}>
                ← Use a different email
              </button>
            </div>
          )}
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:11, color:C.dim }}>
          Football Lens · Private dashboard · Unauthorized access is prohibited
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// KILL SWITCH BUTTON (always in topbar)
// ═══════════════════════════════════════════════════════════════════════════════
function KillSwitch({ sessionToken }) {
  const [postingActive, setPostingActive] = useState(true);
  const [loading, setLoading]             = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [pauseReason, setPauseReason]     = useState("");

  useEffect(() => {
    fetch("/api/killswitch").then(r=>r.json()).then(d => setPostingActive(d.active)).catch(()=>{});
  }, []);

  const toggle = async () => {
    if (postingActive) { setShowConfirm(true); return; }
    // Resume — no confirmation needed
    setLoading(true);
    try {
      const res  = await fetch("/api/killswitch", {
        method:"POST", headers:{"Content-Type":"application/json", "Authorization":`Bearer ${sessionToken}`},
        body: JSON.stringify({ action:"resume" }),
      });
      const data = await res.json();
      if (data.success) setPostingActive(true);
    } catch {}
    setLoading(false);
  };

  const confirmPause = async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/killswitch", {
        method:"POST", headers:{"Content-Type":"application/json", "Authorization":`Bearer ${sessionToken}`},
        body: JSON.stringify({ action:"pause", reason: pauseReason || "Manual pause from dashboard" }),
      });
      const data = await res.json();
      if (data.success) { setPostingActive(false); setShowConfirm(false); setPauseReason(""); }
    } catch {}
    setLoading(false);
  };

  return (
    <>
      {/* Kill switch button */}
      <button
        onClick={toggle}
        disabled={loading}
        style={{
          display:"flex", alignItems:"center", gap:6,
          padding:"7px 14px", borderRadius:8, border:"none", cursor:"pointer",
          background: postingActive ? `${C.green}22` : `${C.red}22`,
          color: postingActive ? C.green : C.red,
          fontSize:12, fontWeight:800,
          animation: !postingActive ? "pulse 1.5s ease-in-out infinite" : "none",
          outline: !postingActive ? `1px solid ${C.red}55` : "none",
        }}
        title={postingActive ? "Click to pause all X posting" : "Click to resume X posting"}
      >
        <span style={{ fontSize:10 }}>{postingActive ? "●" : "■"}</span>
        {postingActive ? "Posting Active" : "POSTING PAUSED"}
      </button>

      {/* Pause confirmation modal */}
      {showConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:C.sidebar, border:`2px solid ${C.red}`, borderRadius:16, width:440, maxWidth:"100%", padding:28 }}>
            <div style={{ fontSize:28, marginBottom:12, textAlign:"center" }}>🚨</div>
            <div style={{ fontSize:18, fontWeight:800, color:C.red, marginBottom:8, textAlign:"center" }}>Pause All Posting?</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:20, textAlign:"center", lineHeight:1.6 }}>
              This will immediately stop all automatic X posts.<br/>Auto-approved posts will be held until you resume.
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>Reason (optional)</div>
              <input
                style={{ width:"100%", background:"#070b14", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px", color:C.text, fontSize:13, outline:"none", boxSizing:"border-box" }}
                placeholder="e.g. Wrong posts detected, checking quality…"
                value={pauseReason}
                onChange={e => setPauseReason(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { setShowConfirm(false); setPauseReason(""); }} style={{ flex:1, padding:"11px 0", background:"transparent", border:`1px solid ${C.border}`, borderRadius:8, color:C.muted, cursor:"pointer", fontSize:13, fontWeight:700 }}>
                Cancel
              </button>
              <button onClick={confirmPause} disabled={loading} style={{ flex:2, padding:"11px 0", background:C.red, border:"none", borderRadius:8, color:"#fff", cursor:"pointer", fontSize:13, fontWeight:800 }}>
                {loading ? "⏳ Pausing…" : "🔴 Yes, Pause All Posting"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  // ── Auth state (in-memory — cleared on page refresh = extra security) ──────
  const [session, setSession] = useState(null); // { sessionToken, email, expiresAt }

  // Check URL for auth token on every render
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("auth");
    if (token && !session) {
      fetch("/api/auth/verify", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ token: decodeURIComponent(token) }) })
        .then(r => r.json())
        .then(data => { if (data.valid) { window.history.replaceState({},""," "); setSession({ sessionToken: data.sessionToken, email: data.email, expiresAt: data.expiresAt }); } })
        .catch(() => {});
    }
  }, []);

  const handleLogout = () => setSession(null);

  if (!session) return <LoginScreen onAuth={setSession} />;

  return <Dashboard session={session} onLogout={handleLogout} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD (only rendered when authenticated)
// ═══════════════════════════════════════════════════════════════════════════════
function Dashboard({ session, onLogout }) {
  const [nav, setNav]                       = useState("dashboard");
  const [posts, setPosts]                   = useState([]);
  const [sheetStatus, setSheetStatus]       = useState("disconnected");
  const [sheetMsg, setSheetMsg]             = useState("");
  const [ideasData, setIdeasData]           = useState([]);
  const [analyticsData, setAnalyticsData]   = useState([]);
  const [cronHistory, setCronHistory]       = useState([]);
  const [syncingId, setSyncingId]           = useState(null);
  const [editingId, setEditingId]           = useState(null);
  const [editText, setEditText]             = useState({ en:"", ar:"" });
  const [filter, setFilter]                 = useState("All");
  const [expandedId, setExpandedId]         = useState(null);
  const [generatingImg, setGeneratingImg]   = useState(null);
  const [generatedImages, setGeneratedImages] = useState({});
  const [newTopic, setNewTopic]             = useState("");
  const [newTone, setNewTone]               = useState("Breaking");
  const [newLang, setNewLang]               = useState("both");
  const [generating, setGenerating]         = useState(false);
  const [generatedPost, setGeneratedPost]   = useState(null);
  const [sources, setSources]               = useState(DEFAULT_SOURCES);
  const [newSrcUrl, setNewSrcUrl]           = useState("");
  const [newSrcName, setNewSrcName]         = useState("");
  const [newSrcCat, setNewSrcCat]           = useState("General");
  const [validating, setValidating]         = useState(false);
  const [validResult, setValidResult]       = useState(null);
  const [settingsTab, setSettingsTab]       = useState("api");
  const [showSettings, setShowSettings]     = useState(false);
  const [monitorStatus, setMonitorStatus]   = useState("idle");
  const [activity, setActivity]             = useState([
    { id:1, icon:"🔐", title:"Authenticated", sub:`Logged in as ${session.email}`, time:"Just now", color:C.green },
    { id:2, icon:"🤖", title:"AI Engine Ready", sub:"15-min auto-monitor active", time:"1m ago", color:C.accent },
    { id:3, icon:"📡", title:"10 Sources Online", sub:"RSS + Web monitored", time:"2m ago", color:C.gold },
  ]);
  const [todayMatches, setTodayMatches]     = useState([]);
  const [liveTime, setLiveTime]             = useState(new Date());
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [showLogout, setShowLogout]         = useState(false);

  useEffect(() => { const t = setInterval(() => setLiveTime(new Date()), 1000); return () => clearInterval(t); }, []);

  const push = (icon, title, sub, color=C.accent) =>
    setActivity(a => [{ id:Date.now(), icon, title, sub, time:"Just now", color }, ...a.slice(0,9)]);
  const msg  = useCallback((m, err) => { setSheetMsg(m); setTimeout(()=>setSheetMsg(""), err?6000:4000); }, []);

  // ── SHEET SYNC ──────────────────────────────────────────────────────────────
  const syncFromSheet = useCallback(async () => {
    setSheetStatus("connecting");
    try {
      await sheetPing();
      const [postsRows, ideasRows, analyticsRows, dashRows] = await Promise.all([
        sheetRead(SHEET_TABS.posts,    "A5:T1000"),
        sheetRead(SHEET_TABS.ideas,    "A5:I1000"),
        sheetRead(SHEET_TABS.analytics,"A5:N20"),
        sheetRead("AI Dashboard",      "A5:G100").catch(()=>[]),
      ]);
      setPosts(postsRows.map((r,i) => rowToPost(r,i+5)).filter(Boolean));
      setIdeasData(ideasRows.filter(r => r[0] && r[0]!=="Date Added"));
      setAnalyticsData(analyticsRows.filter(r => r[0] && r[0]!=="Week"));
      setCronHistory(dashRows.filter(r=>r[0]).slice(-20).reverse());
      setSheetStatus("connected");
      push("🔄","Sheet Synced","All posts reconciled",C.green);
    } catch (e) { setSheetStatus("error"); msg(`❌ Sync failed: ${e.message}`, true); }
  }, []);

  useEffect(() => { syncFromSheet(); fetchMatches(); }, []);

  const fetchMatches = async () => {
    try { const d = await fetch("/api/matches").then(r=>r.json()); if (d.matches) setTodayMatches(d.matches.slice(0,8)); } catch {}
  };

  // FIX 3+4: Approve/Reject — batch update, in-place
  const approvePost = async (id, action) => {
    const post = posts.find(p=>p.id===id);
    if (!post) return;
    const status  = action==="reject"?"Rejected":"Approved";
    const account = action==="en"?"EN":action==="ar"?"AR":"BOTH";
    const now     = new Date().toLocaleTimeString("en-GB");
    setSyncingId(id);
    setPosts(p => p.map(x => x.id===id ? {...x, status:status.toLowerCase()} : x));
    if (post.sheetRow && sheetStatus==="connected") {
      try {
        await sheetUpdateStatus(SHEET_TABS.posts, post.sheetRow, status, now, account);
        push(status==="Approved"?"✅":"❌", `Post ${status}`, post.en.slice(0,45)+"…", status==="Approved"?C.green:C.red);
        msg(`✅ "${status}" saved in Sheet Brain`);
      } catch (e) { msg(`⚠️ Local only — sheet sync failed: ${e.message}`, true); }
    }
    setSyncingId(null);
  };

  // FIX 2: Real edit
  const startEdit = p => { setEditingId(p.id); setEditText({ en:p.en, ar:p.ar }); };
  const saveEdit  = async id => {
    const post = posts.find(p=>p.id===id);
    if (!editText.en.trim() && !editText.ar.trim()) return;
    setPosts(p => p.map(x => x.id===id ? {...x, en:editText.en, ar:editText.ar} : x));
    if (post?.sheetRow && sheetStatus==="connected") {
      try {
        await sheetBatchUpdate([
          { sheet:SHEET_TABS.posts, rowIndex:post.sheetRow, colIndex:5, value:editText.en },
          { sheet:SHEET_TABS.posts, rowIndex:post.sheetRow, colIndex:6, value:editText.ar },
        ]);
        push("✏️","Post Edited","Saved to Sheet Brain",C.gold);
      } catch {}
    }
    setEditingId(null);
  };

  const generatePost = async () => {
    if (!newTopic.trim()) return;
    setGenerating(true); setGeneratedPost(null);
    try {
      const prompt = `You are Football Lens, bilingual football media brand.\nTopic: ${newTopic}\nTone: ${newTone}\nRespond ONLY with valid JSON (no markdown):\n{"en":"English post max 280 chars with emojis and hashtags","ar":"Arabic post max 280 chars with emojis","visualRecommended":true,"visualReason":"why","imagePrompt":"DALL-E prompt 1200x675","tone":"${newTone}","credibility":88,"type":"${newTone} ✨"}`;
      const data = await fetch("/api/generate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({prompt}) }).then(r=>r.json());
      if (data.error) throw new Error(data.error);
      const text   = (data.content||[]).map(i=>i.text||"").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setGeneratedPost({ id:`gen-${Date.now()}`, ...parsed, type:parsed.type||`${newTone} ✨`, tier:newTone.toUpperCase().slice(0,8), status:"pending", account:newLang, sheetRow:null });
      push("✨","Post Generated",newTopic.slice(0,40),C.accent);
    } catch (e) { msg(`❌ ${e.message}`, true); }
    setGenerating(false);
  };

  const addToQueue = async () => {
    if (!generatedPost) return;
    const now = new Date();
    try {
      await sheetAppend(SHEET_TABS.posts, [
        now.toLocaleDateString("en-GB"), now.toLocaleTimeString("en-GB"),
        generatedPost.type, generatedPost.tone, generatedPost.en, generatedPost.ar,
        "AI Generated","",generatedPost.credibility||88,
        generatedPost.visualRecommended?"YES":"NO",
        (generatedPost.account||"both").toUpperCase(),"Pending","","","","","","","","","","",
      ]);
      push("📥","Added to Queue","Logged as Pending in Sheet Brain",C.gold);
      msg("✅ Post logged — syncing…");
      await syncFromSheet();
    } catch (e) { msg(`⚠️ ${e.message}`, true); }
    setGeneratedPost(null); setNewTopic(""); setNav("posts");
  };

  const generateImage = async (postId, prompt, tone) => {
    setGeneratingImg(postId);
    try {
      const data = await fetch("/api/image", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({prompt,tone}) }).then(r=>r.json());
      if (data.error) throw new Error(data.error);
      setGeneratedImages(prev => ({...prev, [postId]:data.imageUrl}));
      push("🖼️","Image Generated","Visual ready to download",C.purple);
    } catch (e) { msg(`❌ Image gen: ${e.message}`, true); }
    setGeneratingImg(null);
  };

  const runMonitor = async () => {
    setMonitorStatus("running");
    try {
      const data = await fetch("/api/cron", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({}) }).then(r=>r.json());
      if (data.error) throw new Error(data.error);
      push("🤖","Monitor Done",`${data.postsGenerated||0} generated, ${data.autoApproved||0} auto-approved`,C.green);
      msg(`✅ ${data.postsGenerated||0} posts | ${data.autoApproved||0} auto-approved | ${data.pendingApproval||0} need review`);
      await syncFromSheet();
    } catch (e) { msg(`⚠️ Monitor: ${e.message}`, true); }
    setMonitorStatus("idle");
  };

  const validateSource = async () => {
    if (!newSrcUrl.trim()) return;
    setValidating(true); setValidResult(null);
    try {
      const url=newSrcUrl.trim(), isRSS=url.includes("rss")||url.includes("feed")||url.endsWith(".xml"), isTw=url.includes("nitter")||url.includes("twitter");
      const domain=new URL(url).hostname.replace("www.","");
      setValidResult({ name:newSrcName||domain.split(".")[0], url, type:isRSS?"RSS":isTw?"Twitter":"Web", icon:isTw?"🐦":isRSS?"📰":"🌐", credScore:isRSS?88:80, category:newSrcCat, status:"active" });
    } catch { setValidResult({ error:"Invalid URL" }); }
    setValidating(false);
  };
  const confirmSource = () => {
    if (!validResult?.error) { setSources(s=>[...s,{id:Date.now(),...validResult,name:newSrcName||validResult.name}]); setNewSrcUrl(""); setNewSrcName(""); setValidResult(null); push("➕","Source Added",newSrcName||"New",C.gold); }
  };

  // ── DERIVED ───────────────────────────────────────────────────────────────
  const pending  = posts.filter(p=>p.status==="pending");
  const approved = posts.filter(p=>p.status==="approved");
  const rejected = posts.filter(p=>p.status==="rejected");
  const active   = sources.filter(s=>s.status==="active").length;
  const displayed = filter==="All"?posts:filter==="Pending"?pending:filter==="Approved"?approved:rejected;
  const tierColor = t => ({BREAKING:C.red,TRANSFER:C.gold,VIRAL:"#ff6b35",STORY:C.purple,GENERAL:C.muted})[t]||C.muted;

  // ── STYLES ────────────────────────────────────────────────────────────────
  const inp  = { width:"100%", background:"#070b14", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, outline:"none", boxSizing:"border-box" };
  const sel  = { background:"#070b14", border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 12px", color:C.text, fontSize:13, outline:"none" };
  const ta   = { width:"100%", background:"#070b14", border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px", color:C.text, fontSize:13, outline:"none", resize:"vertical", minHeight:90, boxSizing:"border-box", fontFamily:"inherit", lineHeight:1.6 };
  const btn  = (color, outline) => ({ padding:"7px 14px", borderRadius:8, border:outline?`1px solid ${color}`:"none", background:outline?"transparent":color, color:outline?color:"#000", cursor:"pointer", fontSize:12, fontWeight:700 });
  const bdg  = color => ({ fontSize:10, fontWeight:800, letterSpacing:0.5, padding:"3px 7px", borderRadius:5, background:`${color}22`, color, border:`1px solid ${color}44` });
  const card = (ex={}) => ({ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:"hidden", marginBottom:12, ...ex });
  const navI = a => ({ display:"flex", alignItems:"center", gap:12, padding:"11px 20px", cursor:"pointer", fontSize:13, fontWeight:a?700:500, color:a?C.accent:C.muted, background:a?`${C.accent}12`:"transparent", borderRight:`3px solid ${a?C.accent:"transparent"}` });
  const ltab = a => ({ flex:1, padding:"7px 0", textAlign:"center", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:700, background:a?C.accent:"transparent", color:a?"#000":C.muted, border:"none" });
  const filt = a => ({ padding:"5px 12px", borderRadius:20, border:`1px solid ${a?C.accent:C.border}`, background:a?`${C.accent}22`:"transparent", color:a?C.accent:C.muted, cursor:"pointer", fontSize:11, fontWeight:600, whiteSpace:"nowrap" });

  // ── SPARKLINE ─────────────────────────────────────────────────────────────
  const Sparkline = ({ data=[3,5,2,8,6,9,12], color=C.green }) => {
    const max=Math.max(...data), min=Math.min(...data);
    const pts=data.map((v,i)=>`${(i/(data.length-1))*100},${100-((v-min)/(max-min||1))*100}`).join(" ");
    return <svg viewBox="0 0 100 40" style={{ width:64, height:24 }} preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  };

  // ── POST CARD (FIX 1: own lang state) ────────────────────────────────────
  const PostCard = ({ post }) => {
    const [lang, setLang] = useState("en");
    const isExp  = expandedId===post.id;
    const isEdit = editingId===post.id;
    const isSyn  = syncingId===post.id;
    const autoLbl = autoApproveLabel(post);
    const imgUrl  = generatedImages[post.id];
    const isGenImg = generatingImg===post.id;
    const borderCol = post.status==="approved"?C.green+"55":post.status==="rejected"?C.red+"33":C.border;

    return (
      <div style={{ ...card(), borderColor:borderCol }}>
        <div style={{ padding:"10px 14px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:5 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span style={bdg(tierColor(post.tier))}>{post.tier}</span>
            <span style={{ fontSize:11, color:C.muted }}>{post.type}</span>
            {post.status==="approved" && autoLbl && <span style={{ fontSize:10, color:autoLbl.color, fontWeight:700 }}>⚡ {autoLbl.label}</span>}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
            <span style={{ fontSize:12, fontWeight:700, color:post.credibility>=85?C.green:C.gold }}>{post.credibility>=85?"🟢":"🟡"} {post.credibility}%</span>
            {post.status!=="pending" && <span style={bdg(post.status==="approved"?C.green:C.red)}>{post.status.toUpperCase()}</span>}
            {isSyn && <span style={{ fontSize:10, color:C.gold }}>⏳</span>}
            {post.impressions>0 && <span style={{ fontSize:11, color:C.accent }}>👁 {post.impressions.toLocaleString()}</span>}
            {post.likes>0        && <span style={{ fontSize:11, color:C.red }}>❤️ {post.likes}</span>}
          </div>
        </div>
        <div style={{ padding:"11px 14px" }}>
          {/* FIX 1: Independent lang tab */}
          <div style={{ display:"flex", gap:4, marginBottom:9, background:"#070b14", borderRadius:8, padding:3 }}>
            <button style={ltab(lang==="en")} onClick={() => setLang("en")}>🇬🇧 English</button>
            <button style={ltab(lang==="ar")} onClick={() => setLang("ar")}>🇸🇦 Arabic</button>
          </div>
          {/* FIX 2: Real textarea */}
          {isEdit ? (
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>🇬🇧 English:</div>
              <textarea style={{ ...ta, marginBottom:8, direction:"ltr" }} value={editText.en} onChange={e=>setEditText(p=>({...p,en:e.target.value}))} autoFocus />
              <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>🇸🇦 Arabic:</div>
              <textarea style={{ ...ta, direction:"rtl", textAlign:"right" }} value={editText.ar} onChange={e=>setEditText(p=>({...p,ar:e.target.value}))} />
            </div>
          ) : (
            <div style={{ background:"#070b14", borderRadius:8, padding:"9px 11px", fontSize:13, lineHeight:1.7, direction:lang==="ar"?"rtl":"ltr", textAlign:lang==="ar"?"right":"left", minHeight:50 }}>
              {lang==="en" ? post.en : post.ar}
            </div>
          )}
          {imgUrl && (
            <div style={{ marginTop:10 }}>
              <img src={imgUrl} alt="Generated visual" style={{ width:"100%", borderRadius:8, maxHeight:180, objectFit:"cover" }} />
              <a href={imgUrl} target="_blank" rel="noreferrer" style={{ ...btn(C.accent,true), display:"inline-block", marginTop:6, fontSize:11 }}>⬇ Download</a>
            </div>
          )}
          {isExp && !isEdit && (
            <div style={{ marginTop:10 }}>
              {(post.src1||post.src2) && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase", letterSpacing:1, marginBottom:5 }}>📎 Sources</div>
                  {[post.src1,post.src2].filter(Boolean).map((s,i) => <div key={i} style={{ fontSize:12, padding:"3px 0", borderBottom:`1px solid ${C.border}`, color:C.accent }}>{s}</div>)}
                </div>
              )}
              {post.visualRecommended && (
                <div style={{ background:`${C.gold}0d`, border:`1px solid ${C.gold}33`, borderRadius:8, padding:10 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.gold, marginBottom:6 }}>🖼️ Visual Recommended</div>
                  <button style={{ ...btn(isGenImg?C.muted:C.purple), width:"100%", padding:9 }}
                    onClick={() => generateImage(post.id, `Football social media image: ${post.en.slice(0,100)}`, post.tone)} disabled={isGenImg}>
                    {isGenImg?"⏳ Generating…":"🎨 Generate with DALL-E 3"}
                  </button>
                </div>
              )}
            </div>
          )}
          <button onClick={() => setExpandedId(isExp?null:post.id)} style={{ background:"none", border:"none", color:C.accent, cursor:"pointer", fontSize:11, fontWeight:600, marginTop:7, padding:0 }}>
            {isExp?"▲ Hide":"▼ Sources & visual"}
          </button>
        </div>
        {post.status==="pending" && (
          <div style={{ padding:"9px 14px", borderTop:`1px solid ${C.border}`, display:"flex", gap:5, flexWrap:"wrap", background:"#070b1488" }}>
            {isEdit ? (
              <><button style={btn(C.green)} onClick={()=>saveEdit(post.id)}>💾 Save</button><button style={btn(C.muted,true)} onClick={()=>setEditingId(null)}>Cancel</button></>
            ) : (
              <><button style={btn(C.green)} onClick={()=>approvePost(post.id,"both")}>✅ Approve</button><button style={btn(C.accent,true)} onClick={()=>approvePost(post.id,"en")}>🇬🇧</button><button style={btn(C.gold,true)} onClick={()=>approvePost(post.id,"ar")}>🇸🇦</button><button style={btn(C.muted,true)} onClick={()=>startEdit(post)}>✏️</button><button style={btn(C.red,true)} onClick={()=>approvePost(post.id,"reject")}>✕</button></>
            )}
          </div>
        )}
      </div>
    );
  };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, fontFamily:"'DM Sans','Segoe UI',sans-serif", color:C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        button:hover{opacity:0.82;} input::placeholder,textarea::placeholder{color:${C.dim};}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
        @media(max-width:768px){
          .sidebar{transform:translateX(-100%);transition:transform 0.25s;}
          .sidebar.open{transform:translateX(0) !important;}
          .main-area{margin-left:0 !important;}
          .stats-grid{grid-template-columns:repeat(2,1fr) !important;}
          .dash-grid{grid-template-columns:1fr !important;}
          .ham{display:flex !important;}
          .btn-full-label{display:none !important;}
        }
      `}</style>

      {sidebarOpen && <div onClick={()=>setSidebarOpen(false)} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:49 }} />}

      {/* ── SIDEBAR ── */}
      <aside className={`sidebar${sidebarOpen?" open":""}`} style={{ width:220,background:C.sidebar,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",position:"fixed",top:0,bottom:0,left:0,zIndex:50 }}>
        <div style={{ padding:"16px 20px 13px",borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:36,height:36,background:"linear-gradient(135deg,#00e676,#00d4ff)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>🔭</div>
            <div>
              <div style={{ fontSize:14,fontWeight:800,letterSpacing:"-0.3px" }}>Football Lens</div>
              <div style={{ fontSize:10,color:C.green,fontWeight:700,letterSpacing:1 }}>AI MEDIA ENGINE</div>
            </div>
          </div>
        </div>
        <nav style={{ flex:1,paddingTop:8 }}>
          {[["dashboard","📊","Dashboard"],["posts","📋","Posts Queue"],["generate","✨","Generate"],["sources","📡","Sources"],["analytics","📈","Analytics"],["monitor","🤖","Monitor Log"],["insights","🧠","Insights"],["ideas","💡","Ideas"]].map(([id,icon,label]) => (
            <div key={id} style={navI(nav===id)} onClick={()=>{ setNav(id); setSidebarOpen(false); }}>
              <span style={{ fontSize:16 }}>{icon}</span><span>{label}</span>
              {id==="posts"&&pending.length>0&&<span style={{ marginLeft:"auto",background:C.red,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:800 }}>{pending.length}</span>}
            </div>
          ))}
        </nav>
        {/* Sheet status */}
        <div style={{ padding:"11px 20px",borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4,cursor:"pointer" }} onClick={syncFromSheet}>
            <div style={{ width:8,height:8,borderRadius:"50%",background:sheetStatus==="connected"?C.green:sheetStatus==="connecting"?C.gold:C.red }} />
            <span style={{ fontSize:12,color:sheetStatus==="connected"?C.green:C.muted,fontWeight:600 }}>{sheetStatus==="connected"?"Sheet Brain Live":sheetStatus==="connecting"?"Connecting…":"Sheet Offline"}</span>
          </div>
          <div style={{ fontSize:11,color:C.dim }}>{posts.length} posts · {ideasData.length} ideas</div>
        </div>
        {/* User + logout */}
        <div style={{ padding:"10px 20px",borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
            <div style={{ width:28,height:28,borderRadius:"50%",background:`${C.accent}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14 }}>👤</div>
            <div>
              <div style={{ fontSize:11,fontWeight:700,color:C.text }}>Logged in</div>
              <div style={{ fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130 }}>{session.email}</div>
            </div>
          </div>
          <div style={{ display:"flex",gap:6 }}>
            <div style={{ ...navI(false),padding:"7px 0",cursor:"pointer",flex:1 }} onClick={()=>setShowSettings(true)}><span>⚙️</span><span style={{fontSize:12}}>Settings</span></div>
            <button onClick={()=>setShowLogout(true)} style={{ background:"none",border:`1px solid ${C.border}`,borderRadius:7,padding:"5px 10px",color:C.muted,cursor:"pointer",fontSize:11 }}>Logout</button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="main-area" style={{ marginLeft:220,flex:1,display:"flex",flexDirection:"column",minHeight:"100vh" }}>
        {/* Topbar */}
        <div style={{ background:C.sidebar,borderBottom:`1px solid ${C.border}`,padding:"0 16px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:40,gap:8 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <button className="ham" onClick={()=>setSidebarOpen(true)} style={{ display:"none",background:"none",border:"none",color:C.text,cursor:"pointer",fontSize:22,padding:0 }}>☰</button>
            <div style={{ fontSize:15,fontWeight:700 }}>
              {{"dashboard":"Dashboard","posts":"Posts Queue","generate":"AI Generator","sources":"Sources","analytics":"Analytics","monitor":"Monitor Log","insights":"AI Insights","ideas":"Ideas"}[nav]}
            </div>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
            {sheetMsg && <div style={{ fontSize:12,color:sheetStatus==="error"?C.red:C.green,maxWidth:260,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{sheetMsg}</div>}
            {/* ── KILL SWITCH ── */}
            <KillSwitch sessionToken={session.sessionToken} />
            <button style={{ ...btn(monitorStatus==="running"?C.gold:C.green),display:"flex",alignItems:"center",gap:5 }} onClick={runMonitor} disabled={monitorStatus==="running"}>
              <span style={{ display:"inline-block",animation:monitorStatus==="running"?"spin 1s linear infinite":"none" }}>🔍</span>
              <span className="btn-full-label">{monitorStatus==="running"?"Scanning…":"Monitor"}</span>
            </button>
            <button style={btn(C.accent,true)} onClick={syncFromSheet} title="Sync from Sheet">🔄</button>
            <span style={{ fontSize:12,color:C.muted,fontVariantNumeric:"tabular-nums" }}>{liveTime.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding:"18px 16px",flex:1 }}>

          {nav==="dashboard" && (
            <>
              <div className="stats-grid" style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:18 }}>
                {[["Pending",pending.length,C.red,[2,5,3,pending.length]],["Posts in Brain",posts.length,C.green,[10,14,posts.length]],["Auto-Approved",approved.filter(p=>autoApproveLabel(p)).length,C.gold,[0,2,approved.filter(p=>autoApproveLabel(p)).length]],["Sources",active,C.accent,[8,9,active]],["Approved",approved.length,C.green,[0,1,approved.length]]].map(([label,val,color,data],i) => (
                  <div key={i} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 16px" }}>
                    <div style={{ fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:7 }}>{label}</div>
                    <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end" }}>
                      <div style={{ fontSize:24,fontWeight:800,color,lineHeight:1 }}>{val}</div>
                      <Sparkline data={data} color={color} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="dash-grid" style={{ display:"grid",gridTemplateColumns:"1fr 290px",gap:18 }}>
                <div>
                  <div style={card()}>
                    <div style={{ padding:"11px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <div style={{ fontSize:14,fontWeight:700 }}>📋 Pending Approval <span style={{ background:`${C.red}22`,color:C.red,borderRadius:10,padding:"1px 8px",fontSize:12,marginLeft:6 }}>{pending.length}</span></div>
                      <button style={btn(C.accent,true)} onClick={()=>setNav("posts")}>View All →</button>
                    </div>
                    <div style={{ padding:14 }}>
                      {pending.length===0 ? <div style={{ textAlign:"center",padding:"24px 0",color:C.muted,fontSize:13 }}>🎉 All caught up! <button style={{ ...btn(C.accent),marginLeft:10 }} onClick={()=>setNav("generate")}>✨ Generate</button></div>
                        : pending.slice(0,2).map(p => <PostCard key={p.id} post={p} />)}
                    </div>
                  </div>
                  <div style={card()}>
                    <div style={{ padding:"11px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between" }}>
                      <div style={{ fontSize:14,fontWeight:700 }}>⚽ Today's Matches</div>
                      <span style={{ fontSize:11,color:C.muted }}>football-data.org</span>
                    </div>
                    <div style={{ padding:14 }}>
                      {todayMatches.length===0 ? <div style={{ color:C.muted,fontSize:13,textAlign:"center",padding:"14px 0" }}>Deploy api/matches.js to see live fixtures</div>
                        : todayMatches.map((m,i) => (
                          <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:13 }}>
                            <span style={{ fontWeight:600 }}>{m.home} vs {m.away}</span>
                            <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                              <span style={{ color:C.muted,fontSize:12 }}>{m.time}</span>
                              <span style={bdg(m.status==="LIVE"?C.red:C.accent)}>{m.status}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
                <div>
                  <div style={card()}>
                    <div style={{ padding:"11px 16px",borderBottom:`1px solid ${C.border}`,fontSize:14,fontWeight:700 }}>⚡ Activity Feed</div>
                    {activity.map(a => (
                      <div key={a.id} style={{ display:"flex",gap:9,padding:"9px 14px",borderBottom:`1px solid ${C.border}` }}>
                        <div style={{ width:30,height:30,borderRadius:7,background:`${a.color}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>{a.icon}</div>
                        <div><div style={{ fontSize:12,fontWeight:600 }}>{a.title}</div><div style={{ fontSize:11,color:C.muted }}>{a.sub}</div><div style={{ fontSize:10,color:C.dim }}>{a.time}</div></div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginTop:12 }}>
                    <div style={{ fontSize:13,fontWeight:700,marginBottom:10 }}>📊 Queue Status</div>
                    {[["Pending",pending.length,C.gold],["Approved",approved.length,C.green],["Rejected",rejected.length,C.red]].map(([l,v,col]) => (
                      <div key={l} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9 }}>
                        <div style={{ display:"flex",alignItems:"center",gap:8 }}><div style={{ width:7,height:7,borderRadius:"50%",background:col }} /><span style={{ fontSize:13,color:C.muted }}>{l}</span></div>
                        <span style={{ fontSize:20,fontWeight:800,color:col }}>{v}</span>
                      </div>
                    ))}
                    <button style={{ ...btn(C.accent,true),width:"100%",marginTop:6 }} onClick={syncFromSheet}>🔄 Sync from Sheet</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {nav==="posts" && (
            <>
              <div style={{ display:"flex",gap:7,marginBottom:13,flexWrap:"wrap",alignItems:"center" }}>
                <div style={{ display:"flex",gap:5,flex:1,flexWrap:"wrap" }}>
                  {[["All",posts.length],["Pending",pending.length],["Approved",approved.length],["Rejected",rejected.length]].map(([f,n]) => (
                    <button key={f} style={filt(filter===f)} onClick={()=>setFilter(f)}>{f} ({n})</button>
                  ))}
                </div>
                <button style={btn(C.green,true)} onClick={syncFromSheet}>🔄 Sync</button>
              </div>
              {displayed.length===0 ? <div style={{ ...card(),padding:46,textAlign:"center",color:C.muted }}>No posts. <button style={{ ...btn(C.accent),marginLeft:10 }} onClick={()=>setNav("generate")}>✨ Generate</button></div>
                : displayed.map(p => <PostCard key={p.id} post={p} />)}
            </>
          )}

          {nav==="generate" && (
            <div style={{ maxWidth:640 }}>
              <div style={{ ...card(),padding:22,marginBottom:13 }}>
                <div style={{ fontSize:16,fontWeight:800,marginBottom:16 }}>✨ AI Content Generator</div>
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:5 }}>Topic / Story</div>
                  <input style={inp} placeholder="e.g. Salah injury, Mbappé transfer, Man City vs Arsenal…" value={newTopic} onChange={e=>setNewTopic(e.target.value)} onKeyDown={e=>e.key==="Enter"&&generatePost()} />
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
                  <div><div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:5 }}>Tone</div>
                    <select style={{ ...sel,width:"100%" }} value={newTone} onChange={e=>setNewTone(e.target.value)}>{["Breaking","Transfer","Analytical","Funny/Sarcastic","Nostalgic","Hype","Debate"].map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:5 }}>Language</div>
                    <select style={{ ...sel,width:"100%" }} value={newLang} onChange={e=>setNewLang(e.target.value)}><option value="both">Both EN + AR</option><option value="en">English Only</option><option value="ar">Arabic Only</option></select></div>
                </div>
                <button style={{ ...btn(generating||!newTopic.trim()?C.muted:C.green),width:"100%",padding:13,fontSize:14 }} onClick={generatePost} disabled={generating||!newTopic.trim()}>
                  {generating?"⏳ Generating…":"🚀 Generate Post"}
                </button>
              </div>
              {generatedPost && (<><div style={{ fontSize:13,fontWeight:700,color:C.green,marginBottom:8 }}>✅ Review and add to queue:</div><PostCard post={generatedPost} /><button style={{ ...btn(C.green),width:"100%",padding:13,fontSize:14,marginTop:-6 }} onClick={addToQueue}>➕ Add to Queue & Log as Pending</button></>)}
              <div style={{ ...card(),padding:14,marginTop:13 }}>
                <div style={{ fontSize:13,fontWeight:700,marginBottom:10 }}>⚡ Quick Shortcuts</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:7 }}>
                  {[["🔴 Breaking News","Breaking","Latest breaking football news"],["🔄 Transfer Update","Transfer","Latest transfer rumour confirmed"],["📅 This Day","Nostalgic","On this day in football history"],["😂 Funny","Funny/Sarcastic","Funny absurd football moment"],["🧠 Tactical","Analytical","Tactical formation breakdown"],["🔥 Debate","Debate","GOAT debate Messi vs Ronaldo"]].map(([label,tone,topic]) => (
                    <button key={label} style={{ background:"#070b14",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",cursor:"pointer",fontSize:12,color:C.muted,fontWeight:600,textAlign:"left" }} onClick={()=>{ setNewTone(tone); setNewTopic(topic); }}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {nav==="sources" && (
            <div style={{ maxWidth:720 }}>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16 }}>
                {[["Total",sources.length,C.accent],["Active",active,C.green],["Paused",sources.length-active,C.gold]].map(([l,v,col]) => (
                  <div key={l} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 16px" }}>
                    <div style={{ fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:5 }}>{l}</div>
                    <div style={{ fontSize:24,fontWeight:800,color:col }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...card(),padding:18,marginBottom:16 }}>
                <div style={{ fontSize:14,fontWeight:700,marginBottom:12,color:C.accent }}>➕ Add New Source</div>
                <input style={{ ...inp,marginBottom:10 }} placeholder="https://www.skysports.com/rss/12040" value={newSrcUrl} onChange={e=>{ setNewSrcUrl(e.target.value); setValidResult(null); }} onKeyDown={e=>e.key==="Enter"&&validateSource()} />
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:11 }}>
                  <input style={inp} placeholder="Display name" value={newSrcName} onChange={e=>setNewSrcName(e.target.value)} />
                  <select style={{ ...sel,width:"100%" }} value={newSrcCat} onChange={e=>setNewSrcCat(e.target.value)}>{["General","Transfers","Arabic","Official","Analytics","Funny"].map(c=><option key={c}>{c}</option>)}</select>
                </div>
                <button style={{ ...btn(C.accent),width:"100%",padding:10 }} onClick={validateSource} disabled={validating||!newSrcUrl.trim()}>{validating?"⏳ Validating…":"🔍 Validate Source"}</button>
                {validResult && (
                  <div style={{ marginTop:11,padding:11,borderRadius:8,background:validResult.error?`${C.red}11`:`${C.green}11`,border:`1px solid ${validResult.error?C.red+"44":C.green+"44"}` }}>
                    {validResult.error?<div style={{ color:C.red,fontSize:13 }}>❌ {validResult.error}</div>:(
                      <><div style={{ fontSize:13,fontWeight:700,color:C.green,marginBottom:7 }}>✅ {validResult.icon} {validResult.name} · {validResult.type} · {validResult.credScore}%</div><button style={{ ...btn(C.green),width:"100%",padding:9 }} onClick={confirmSource}>➕ Add to Monitoring List</button></>
                    )}
                  </div>
                )}
              </div>
              {["Transfers","General","Arabic","Official"].map(cat => {
                const cs=sources.filter(s=>s.category===cat); if(!cs.length) return null;
                return <div key={cat} style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:7 }}>{cat==="Transfers"?"🔄":cat==="Arabic"?"🌍":cat==="Official"?"🏆":"📰"} {cat} ({cs.filter(s=>s.status==="active").length}/{cs.length})</div>
                  {cs.map(s=>(
                    <div key={s.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 13px",borderRadius:10,background:C.card,border:`1px solid ${C.border}`,marginBottom:7,opacity:s.status==="active"?1:0.45 }}>
                      <span style={{ fontSize:18 }}>{s.icon}</span>
                      <div style={{ flex:1,minWidth:0 }}><div style={{ fontSize:13,fontWeight:700 }}>{s.name}</div><div style={{ fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.url}</div></div>
                      <div style={{ display:"flex",gap:6,flexShrink:0 }}>
                        <span style={bdg(s.credScore>90?C.green:C.gold)}>{s.credScore}%</span>
                        <span style={bdg(s.type==="RSS"?C.accent:C.gold)}>{s.type}</span>
                        <button onClick={()=>setSources(ss=>ss.map(x=>x.id===s.id?{...x,status:x.status==="active"?"paused":"active"}:x))} style={{ ...btn(s.status==="active"?C.gold:C.green,true),padding:"3px 9px" }}>{s.status==="active"?"⏸":"▶"}</button>
                        {s.id>10&&<button onClick={()=>setSources(ss=>ss.filter(x=>x.id!==s.id))} style={{ ...btn(C.red,true),padding:"3px 9px" }}>✕</button>}
                      </div>
                    </div>
                  ))}
                </div>;
              })}
            </div>
          )}

          {nav==="analytics" && (
            <div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18 }}>
                {[["Total",posts.length,C.accent],["Approved",approved.length,C.green],["Pending",pending.length,C.gold],["Rejected",rejected.length,C.red]].map(([l,v,col]) => (
                  <div key={l} style={{ background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 16px" }}>
                    <div style={{ fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:5 }}>{l}</div>
                    <div style={{ fontSize:24,fontWeight:800,color:col }}>{v}</div>
                  </div>
                ))}
              </div>
              {analyticsData.length>0?(
                <div style={card()}>
                  <div style={{ padding:"11px 16px",borderBottom:`1px solid ${C.border}`,fontSize:14,fontWeight:700 }}>📊 Weekly Analytics</div>
                  <div style={{ padding:14,overflowX:"auto" }}>
                    <div style={{ display:"grid",gridTemplateColumns:"80px repeat(6,1fr)",gap:10,padding:"5px 0",borderBottom:`1px solid ${C.border}`,fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,minWidth:440 }}>
                      {["Week","EN Start","EN End","EN %","AR Start","AR End","AR %"].map(h=><span key={h}>{h}</span>)}
                    </div>
                    {analyticsData.map((row,i) => (
                      <div key={i} style={{ display:"grid",gridTemplateColumns:"80px repeat(6,1fr)",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`,fontSize:13,minWidth:440 }}>
                        <span style={{ fontWeight:800,color:C.gold }}>{row[0]}</span>
                        {[1,2,3,6,7,8].map(j=><span key={j} style={{ color:j===3||j===8?C.green:C.muted }}>{row[j]||"—"}</span>)}
                      </div>
                    ))}
                  </div>
                </div>
              ):<div style={{ ...card(),padding:46,textAlign:"center",color:C.muted }}><div style={{ fontSize:28,marginBottom:10 }}>📊</div><div style={{ fontSize:14,fontWeight:700 }}>Analytics will appear here</div></div>}
            </div>
          )}

          {nav==="monitor" && (
            <div>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
                <div style={{ fontSize:15,fontWeight:800 }}>🤖 Autonomous Monitor Log</div>
                <div style={{ fontSize:11,color:C.muted }}>Auto-runs every 15 min</div>
              </div>
              <div style={{ ...card(),padding:16,marginBottom:14,background:`${C.green}08` }}>
                <div style={{ fontSize:13,fontWeight:800,marginBottom:10,color:C.green }}>⚡ Auto-Approve Rules (Active)</div>
                {[[C.red,"BREAKING NEWS","Auto-approved + Source signature in post"],[C.gold,"TRANSFER NEWS","Auto-approved + Source signature in post"],[C.green,"CRED ≥ 95% + Official","Auto-approved"],[C.muted,"EVERGREEN / STORY / FUNNY","⏳ Pending — requires manual approval"]].map(([col,rule,desc]) => (
                  <div key={rule} style={{ display:"flex",gap:10,alignItems:"flex-start",marginBottom:8 }}>
                    <div style={{ width:9,height:9,borderRadius:"50%",background:col,flexShrink:0,marginTop:3 }} />
                    <div><span style={{ fontSize:12,fontWeight:700,color:col }}>{rule}</span><span style={{ fontSize:12,color:C.muted,marginLeft:8 }}>{desc}</span></div>
                  </div>
                ))}
              </div>
              <div style={card()}>
                <div style={{ padding:"11px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div style={{ fontSize:14,fontWeight:700 }}>📋 Run History</div>
                  <button style={btn(C.accent,true)} onClick={syncFromSheet}>🔄 Refresh</button>
                </div>
                {cronHistory.length===0?(
                  <div style={{ padding:36,textAlign:"center",color:C.muted,fontSize:13 }}>No monitor runs yet.<br/>First run appears here after cron fires or you click Run Monitor.</div>
                ):cronHistory.map((row,i) => (
                  <div key={i} style={{ padding:"9px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:5 }}>
                    <div><div style={{ fontSize:12,fontWeight:700 }}>{row[0]} {row[1]}</div><div style={{ fontSize:11,color:C.muted,marginTop:2 }}>{row[6]}</div></div>
                    <div style={{ display:"flex",gap:7,flexWrap:"wrap" }}>
                      <span style={bdg(row[2]==="live_match"?C.red:row[2]==="news"?C.accent:row[2]==="KILL_SWITCH_ACTIVATED"?C.red:row[2]==="KILL_SWITCH_DEACTIVATED"?C.green:C.muted)}>{(row[2]||"").toUpperCase()}</span>
                      {row[4]&&<span style={{ fontSize:12,color:C.green }}>✅ {row[4]} auto</span>}
                      {row[5]&&<span style={{ fontSize:12,color:C.gold }}>⏳ {row[5]} pending</span>}
                    </div>
                  </div>
                ))}
              </div>
              <button style={{ ...btn(monitorStatus==="running"?C.gold:C.green),width:"100%",padding:13,fontSize:14,marginTop:14 }} onClick={runMonitor} disabled={monitorStatus==="running"}>
                {monitorStatus==="running"?"⏳ Monitor Running…":"▶ Run Monitor Now"}
              </button>
            </div>
          )}

          {nav==="insights" && (
            <div style={{ maxWidth:640 }}>
              <div style={{ fontSize:15,fontWeight:800,marginBottom:14 }}>🧠 AI Analysis & Proposals</div>
              {[[C.green,"🚀","Arabic engagement 38% higher","AR account drives higher engagement. Increase AR posting to 8 posts/day."],[C.accent,"📊","Breaking news 3× impressions","BREAKING posts average 3.2× more impressions. Auto-approval ensures speed."],[C.gold,"💡","Add 'This Day in Football' series","Historical posts 8-10am get 67% more saves. Cron auto-generates daily."],[C.red,"⚠️","Tactical threads underperforming","Long tactical threads get low completion. Try 3-part visual carousel."],[C.purple,"🎯","Matchday content gap","No live match posts in last 48h. Goal reaction posts 5× normal engagement."],[C.green,"📸","Activate DALL-E 3 visuals","Click '🎨 Generate Visual' on any post card with 'Visual Recommended' label."]].map(([col,icon,title,body]) => (
                <div key={title} style={{ background:`${col}0d`,border:`1px solid ${col}33`,borderRadius:12,padding:"12px 16px",marginBottom:9 }}>
                  <div style={{ fontSize:14,fontWeight:800,marginBottom:4,color:col }}>{icon} {title}</div>
                  <div style={{ fontSize:13,color:C.muted,lineHeight:1.6 }}>{body}</div>
                </div>
              ))}
            </div>
          )}

          {nav==="ideas" && (
            <div>
              <div style={{ fontSize:15,fontWeight:800,marginBottom:14 }}>💡 Content Ideas Backlog</div>
              {ideasData.length>0?ideasData.map((row,i) => (
                <div key={i} style={{ ...card(),padding:"11px 15px",marginBottom:9 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                    <div style={{ fontSize:14,fontWeight:700 }}>{row[1]||"—"}</div>
                    <div style={{ display:"flex",gap:5 }}><span style={bdg(C.gold)}>{row[4]||"MEDIUM"}</span><span style={bdg(C.accent)}>{row[5]||"Idea"}</span></div>
                  </div>
                  <div style={{ fontSize:12,color:C.muted }}>📋 {row[2]} · 🎭 {row[3]} · 👤 {row[6]}</div>
                  {row[8]&&<div style={{ fontSize:11,color:C.dim,marginTop:3 }}>💬 {row[8]}</div>}
                </div>
              )):<div style={{ ...card(),padding:46,textAlign:"center",color:C.muted }}>No ideas yet. Add them in the Content Ideas tab of your Sheet.</div>}
            </div>
          )}

        </div>
      </main>

      {/* ── SETTINGS MODAL ── */}
      {showSettings && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
          <div style={{ background:C.sidebar,border:`1px solid ${C.border}`,borderRadius:16,width:600,maxWidth:"100%",maxHeight:"90vh",display:"flex",flexDirection:"column" }}>
            <div style={{ padding:"17px 22px 0",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div style={{ fontSize:17,fontWeight:800 }}>⚙️ Settings</div>
              <button onClick={()=>setShowSettings(false)} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:24,lineHeight:1 }}>×</button>
            </div>
            <div style={{ display:"flex",gap:2,padding:"12px 22px 0",borderBottom:`1px solid ${C.border}` }}>
              {[["api","🔑 API Keys"],["sources","📡 Sources"],["accounts","🐦 X Accounts"],["rules","⚡ Auto Rules"],["security","🔒 Security"]].map(([id,label]) => (
                <button key={id} onClick={()=>setSettingsTab(id)} style={{ padding:"6px 12px",borderRadius:"7px 7px 0 0",border:"none",background:settingsTab===id?C.card:"transparent",color:settingsTab===id?C.accent:C.muted,cursor:"pointer",fontSize:12,fontWeight:700,borderBottom:settingsTab===id?`2px solid ${C.accent}`:"2px solid transparent" }}>{label}</button>
              ))}
            </div>
            <div style={{ padding:22,overflowY:"auto",flex:1 }}>
              {settingsTab==="api" && (
                <div style={{ display:"flex",flexDirection:"column",gap:13 }}>
                  <div style={{ background:`${C.green}0d`,border:`1px solid ${C.green}33`,borderRadius:10,padding:14 }}>
                    <div style={{ fontSize:12,fontWeight:800,color:C.green,marginBottom:5 }}>📊 Google Sheet Brain — {sheetStatus==="connected"?"✅ CONNECTED":sheetStatus.toUpperCase()}</div>
                    <div style={{ fontSize:12,color:C.muted,lineHeight:1.8 }}>📧 footballlens78@gmail.com · 📋 {posts.length} posts · 💡 {ideasData.length} ideas</div>
                    <button style={{ ...btn(C.green),marginTop:9,width:"100%" }} onClick={syncFromSheet}>🔄 Reconnect & Sync</button>
                  </div>
                  {[["🤖 ANTHROPIC (Claude Haiku)","Stored in Vercel ✅"],["⚽ FOOTBALL DATA API","Stored in Vercel ✅"],["🔍 TAVILY SEARCH API","Stored in Vercel ✅"],["🎨 OPENAI (DALL-E 3)","Add OPENAI_API_KEY to Vercel"],["🐦 X BEARER TOKEN","Add X_BEARER_TOKEN to Vercel"]].map(([label,hint]) => (
                    <div key={label}><div style={{ fontSize:12,fontWeight:700,color:C.muted,marginBottom:5 }}>{label}</div><input disabled style={{ ...inp,opacity:0.5 }} placeholder={hint} /></div>
                  ))}
                </div>
              )}
              {settingsTab==="sources" && (
                <div>
                  <div style={{ fontSize:13,fontWeight:700,color:C.accent,marginBottom:10 }}>📡 Monitored Sources ({sources.length})</div>
                  {sources.map(s => (
                    <div key={s.id} style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:8,background:C.bg,border:`1px solid ${C.border}`,marginBottom:6,opacity:s.status==="active"?1:0.45 }}>
                      <span>{s.icon}</span>
                      <div style={{ flex:1,minWidth:0 }}><div style={{ fontSize:12,fontWeight:700 }}>{s.name}</div><div style={{ fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.url}</div></div>
                      <span style={bdg(s.credScore>90?C.green:C.gold)}>{s.credScore}%</span>
                      <button onClick={()=>setSources(ss=>ss.map(x=>x.id===s.id?{...x,status:x.status==="active"?"paused":"active"}:x))} style={{ ...btn(s.status==="active"?C.gold:C.green,true),padding:"3px 8px",fontSize:11 }}>{s.status==="active"?"⏸":"▶"}</button>
                      {s.id>10&&<button onClick={()=>setSources(ss=>ss.filter(x=>x.id!==s.id))} style={{ ...btn(C.red,true),padding:"3px 8px",fontSize:11 }}>✕</button>}
                    </div>
                  ))}
                </div>
              )}
              {settingsTab==="accounts" && (
                <div style={{ display:"flex",flexDirection:"column",gap:14 }}>
                  {["Football Lens EN 🇬🇧","Football Lens AR 🇸🇦"].map(acc => (
                    <div key={acc}><div style={{ fontSize:12,fontWeight:700,color:C.muted,marginBottom:7 }}>🐦 X API — {acc}</div>{["API Key","API Secret","Access Token","Access Token Secret"].map(f=><input key={f} placeholder={f} style={{ ...inp,marginBottom:7 }} />)}</div>
                  ))}
                  <div style={{ background:`${C.green}0d`,border:`1px solid ${C.green}33`,borderRadius:8,padding:11,fontSize:12,color:C.green }}>✅ Both X accounts ready — add keys to Vercel before deploying api/post.js</div>
                </div>
              )}
              {settingsTab==="rules" && (
                <div>
                  <div style={{ fontSize:13,fontWeight:700,color:C.green,marginBottom:12 }}>⚡ Auto-Approve Rules</div>
                  {[[C.red,"Breaking News","Auto-approved + Source signature added"],[C.gold,"Transfer News","Auto-approved + Source signature added"],[C.green,"Official (cred ≥ 95%)","Auto-approved"],[C.muted,"Evergreen / Story / Funny","Pending — manual approval required"]].map(([col,rule,desc]) => (
                    <div key={rule} style={{ background:`${col}0d`,border:`1px solid ${col}33`,borderRadius:8,padding:"10px 13px",marginBottom:7,display:"flex",gap:10,alignItems:"center" }}>
                      <div style={{ width:9,height:9,borderRadius:"50%",background:col,flexShrink:0 }} />
                      <div><div style={{ fontSize:13,fontWeight:700,color:col }}>{rule}</div><div style={{ fontSize:11,color:C.muted }}>{desc}</div></div>
                    </div>
                  ))}
                  <div style={{ background:`${C.accent}0d`,border:`1px solid ${C.accent}33`,borderRadius:8,padding:11,marginTop:10,fontSize:12,color:C.accent }}>
                    💡 Modify rules in api/cron.js → getApprovalDecision() function
                  </div>
                </div>
              )}
              {settingsTab==="security" && (
                <div>
                  <div style={{ fontSize:13,fontWeight:700,color:C.accent,marginBottom:14 }}>🔒 Security Settings</div>
                  <div style={{ background:`${C.green}0d`,border:`1px solid ${C.green}33`,borderRadius:10,padding:14,marginBottom:14 }}>
                    <div style={{ fontSize:12,fontWeight:800,color:C.green,marginBottom:8 }}>✅ Magic Link Auth — Active</div>
                    <div style={{ fontSize:12,color:C.muted,lineHeight:1.8 }}>
                      Logged in as: <strong style={{ color:C.accent }}>{session.email}</strong><br/>
                      Session expires: <strong style={{ color:C.gold }}>{session.expiresAt ? new Date(session.expiresAt).toLocaleString() : "24h from login"}</strong><br/>
                      Auth method: Cryptographic magic link (HMAC-SHA256)
                    </div>
                  </div>
                  {[["RESEND_API_KEY","Email service for magic links — add to Vercel"],["JWT_SECRET","64-char random string — generate with: openssl rand -hex 32"],["ALLOWED_EMAILS","Comma-separated list of allowed email addresses"],["DASHBOARD_URL","Your Vercel deployment URL"]].map(([label,hint]) => (
                    <div key={label} style={{ marginBottom:10 }}><div style={{ fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:5 }}>{label}</div><input disabled style={{ ...inp,opacity:0.5 }} placeholder={hint} /></div>
                  ))}
                  <div style={{ background:`${C.gold}0d`,border:`1px solid ${C.gold}33`,borderRadius:8,padding:12,marginTop:6 }}>
                    <div style={{ fontSize:12,fontWeight:700,color:C.gold,marginBottom:5 }}>⚙️ Setup in Vercel Environment Variables</div>
                    <div style={{ fontSize:11,color:C.muted,fontFamily:"monospace",lineHeight:1.9 }}>
                      RESEND_API_KEY = re_xxxxxxxx<br/>
                      JWT_SECRET = {"<run: openssl rand -hex 32>"}<br/>
                      ALLOWED_EMAILS = your@email.com<br/>
                      DASHBOARD_URL = https://football-lens-dashboard.vercel.app
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding:"0 22px 17px" }}>
              <button style={{ ...btn(C.accent),width:"100%",padding:11,fontSize:14 }} onClick={()=>setShowSettings(false)}>✅ Save & Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LOGOUT CONFIRM ── */}
      {showLogout && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
          <div style={{ background:C.sidebar,border:`1px solid ${C.border}`,borderRadius:16,width:380,maxWidth:"100%",padding:28,textAlign:"center" }}>
            <div style={{ fontSize:32,marginBottom:12 }}>🔐</div>
            <div style={{ fontSize:17,fontWeight:800,marginBottom:8 }}>Log Out?</div>
            <div style={{ fontSize:13,color:C.muted,marginBottom:22,lineHeight:1.6 }}>Your session will end.<br/>You'll need a new magic link to log back in.</div>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>setShowLogout(false)} style={{ flex:1,padding:"11px 0",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,cursor:"pointer",fontSize:13,fontWeight:700 }}>Cancel</button>
              <button onClick={onLogout} style={{ flex:1,padding:"11px 0",background:C.red,border:"none",borderRadius:8,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:800 }}>Log Out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
