/* MathQuest auth (Login / Sign up) + Admin panel.
   Demo mode: accounts live in this tab's memory (passwords stored only as SHA-256 hashes).
   Server mode: uses window.MQ_API (mq-api) → /auth/login, /auth/register, /admin/*. */
(function () {
  var MQ = window.MQ, DATA = window.CURRICULUM, API = window.MQ_API;
  if (!MQ || !DATA) return;
  var q = function (s, r) { return (r || document).querySelector(s); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var OWL = (q('img[data-char="owl"]') || {}).src || "mascot_owl.png";

  /* ---------- tiny SHA-256 (works without crypto.subtle) ---------- */
  function sha256(str) {
    var s = unescape(encodeURIComponent(str)), K = [], H = [], i, j, isP = function (n) { for (var f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
    for (var c = 2, n = 0; n < 64; c++) if (isP(c)) { if (n < 8) H[n] = (Math.pow(c, 1 / 2) * 4294967296) | 0; K[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0; }
    var w = [], L = s.length * 8; s += "\x80"; while (s.length % 64 - 56) s += "\x00";
    for (i = 0; i < s.length; i++) { j = s.charCodeAt(i); w[i >> 2] |= j << ((3 - i) % 4) * 8; }
    w[w.length] = (L / 4294967296) | 0; w[w.length] = L;
    var r = function (v, a) { return (v >>> a) | (v << (32 - a)); };
    for (j = 0; j < w.length;) {
      var W = w.slice(j, j += 16), o = H.slice(0);
      for (i = 0; i < 64; i++) {
        var w15 = W[i - 15], w2 = W[i - 2], a = H[0], e = H[4];
        var t1 = H[7] + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & H[5]) ^ (~e & H[6])) + K[i] + (W[i] = i < 16 ? W[i] : (W[i - 16] + (r(w15, 7) ^ r(w15, 18) ^ (w15 >>> 3)) + W[i - 7] + (r(w2, 17) ^ r(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & H[1]) ^ (a & H[2]) ^ (H[1] & H[2]));
        H = [(t1 + t2) | 0].concat(H); H[4] = (H[4] + t1) | 0; H.length = 8;
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + o[i]) | 0;
    }
    var out = ""; for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (H[i] >> (j * 8)) & 255; out += (b < 16 ? "0" : "") + b.toString(16); }
    return out;
  }
  var hashPw = function (p) { return sha256("mq:" + p); };

  /* ---------- demo store ---------- */
  var DEMO_HASH = "742790564d8c565d8c7db336ace17dd5cc7b5a2597349d9a0500d3a4de9e5f24"; // demo student accounts (offline demo only)
  var NO_LOGIN = "x"; // the offline demo has no admin login
  var now = Date.now(), uidN = 100;
  var USERS = [
    { id: "u1", name: "MathQuest Admin", email: "admin@mathquest.dev", hash: NO_LOGIN, role: "ADMIN", cls: null, blocked: false, at: now },
    { id: "u2", name: "Aarya", email: "aarya@mathquest.dev", hash: DEMO_HASH, role: "STUDENT", cls: 9, blocked: false, at: now },
    { id: "u3", name: "Kabir", email: "kabir@mathquest.dev", hash: DEMO_HASH, role: "STUDENT", cls: 9, blocked: false, at: now },
    { id: "u4", name: "Meera", email: "meera@mathquest.dev", hash: DEMO_HASH, role: "STUDENT", cls: 9, blocked: false, at: now },
    { id: "u5", name: "Rohan", email: "rohan@mathquest.dev", hash: DEMO_HASH, role: "STUDENT", cls: 10, blocked: false, at: now },
    { id: "u6", name: "Zoya", email: "zoya@mathquest.dev", hash: DEMO_HASH, role: "STUDENT", cls: 10, blocked: false, at: now },
    { id: "u7", name: "Ms. Sharma", email: "teacher@mathquest.dev", hash: DEMO_HASH, role: "TEACHER", cls: null, blocked: false, at: now },
    { id: "u8", name: "Aarya Parent", email: "parent@mathquest.dev", hash: DEMO_HASH, role: "PARENT", cls: null, blocked: false, at: now }
  ];
  var CLASSES = []; for (var c = 1; c <= 12; c++) CLASSES.push({ id: "c" + c, no: c, active: c === 9 || c === 10 });
  var XP = { CORRECT_ANSWER: 10, LESSON_COMPLETE: 25, QUIZ_COMPLETE: 50, DAILY_CHALLENGE: 30, PERFECT_QUIZ: 100 };
  var LOG = [];
  function logAct(t) { LOG.unshift({ t: t, at: new Date() }); if (LOG.length > 30) LOG.length = 30; }
  var isAdmin = function (r) { return r === "ADMIN" || r === "SUPER_ADMIN"; };
  var ROLE_LABEL = { ADMIN: "Admin", SUPER_ADMIN: "Super admin", TEACHER: "Teacher", STUDENT: "Student", PARENT: "Parent" };
  var session = null; // {user, mode:'demo'|'server'}
  var server = function () { return session && session.mode === "server" && API && API.on; };

  /* The Page runs in a sandboxed iframe without allow-forms, so real form submits are blocked silently.
     Fire a synthetic "submit" from button clicks and Enter instead. */
  function fakeSubmit(f) { if (f) f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); }
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("button[data-sub]"); if (b && !b.disabled) { e.preventDefault(); fakeSubmit(b.form || b.closest("form")); } }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.isComposing) return; var t = e.target; if (!t || t.tagName !== "INPUT" || /^(checkbox|radio|button)$/i.test(t.type)) return;
    var f = t.form || t.closest("form"); if (f && f.querySelector("button[data-sub]")) { e.preventDefault(); fakeSubmit(f); }
  }, true);
  document.addEventListener("submit", function (e) { if (e.isTrusted) e.preventDefault(); }, true);

  /* ---------- styles ---------- */
  var css = document.createElement("style");
  css.textContent =
    /* ---- login gate: animated gradient, blobs, floating maths, glass card ---- */
    ".ma-gate{position:fixed;inset:0;z-index:10000;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;font-family:var(--x-body,Nunito,system-ui,sans-serif);color:#2B2350;" +
    "background:#4B2BB8 linear-gradient(135deg,#5B2EE6 0%,#7C4DFF 30%,#B06BFF 55%,#14C8B4 100%);background-size:300% 300%;animation:maGrad 18s ease infinite}" +
    ".ma-gate[hidden]{display:none!important}@keyframes maGrad{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}" +
    ".ma-bg{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0}" +
    ".ma-blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.55;animation:maBlob 22s ease-in-out infinite alternate}" +
    ".ma-blob.b1{width:46vmax;height:46vmax;background:#FFC93C;left:-14vmax;top:-16vmax;opacity:.35}.ma-blob.b2{width:40vmax;height:40vmax;background:#FF6B9A;right:-12vmax;top:20%;animation-duration:26s}" +
    ".ma-blob.b3{width:44vmax;height:44vmax;background:#14C8B4;left:20%;bottom:-22vmax;animation-duration:30s}" +
    "@keyframes maBlob{0%{transform:translate(0,0) scale(1)}50%{transform:translate(6vmax,4vmax) scale(1.12)}100%{transform:translate(-4vmax,7vmax) scale(.92)}}" +
    ".ma-sym{position:absolute;bottom:-60px;color:rgba(255,255,255,.28);font:700 28px/1 var(--x-round,Fredoka,system-ui);animation:maFloat linear infinite;will-change:transform}" +
    "@keyframes maFloat{0%{transform:translateY(0) rotate(0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateY(-115vh) rotate(200deg);opacity:0}}" +
    ".ma-wrap{position:relative;z-index:1;box-sizing:border-box;width:100%;max-width:980px;min-height:100%;margin:0 auto;padding:32px 20px;display:grid;grid-template-columns:1fr minmax(0,440px);gap:40px;align-items:center}" +
    ".ma-hero{color:#fff;text-align:center;animation:maIn .8s cubic-bezier(.2,.8,.2,1) both}" +
    ".ma-hero img{display:block;margin:0 auto;width:min(240px,50vw);height:auto;filter:drop-shadow(0 18px 24px rgba(30,10,80,.35));animation:maBob 3.4s ease-in-out infinite}" +
    ".ma-hero h1{font:700 clamp(30px,5vw,48px)/1.05 var(--x-round,Fredoka,system-ui);margin:10px 0 6px;letter-spacing:-.5px;text-shadow:0 4px 18px rgba(30,10,80,.35)}" +
    ".ma-hero p{margin:0;font-weight:700;font-size:16px;opacity:.95}.ma-chips{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px}" +
    ".ma-chips span{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);padding:6px 12px;border-radius:999px;font-weight:800;font-size:13px}" +
    "@keyframes maBob{50%{transform:translateY(-10px) rotate(-2deg)}}@keyframes maIn{from{opacity:0;transform:translateY(24px) scale(.98)}to{opacity:1;transform:none}}" +
    ".ma-card{position:relative;box-sizing:border-box;width:100%;background:rgba(255,255,255,.82);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);border:1px solid rgba(255,255,255,.7);border-radius:28px;" +
    "box-shadow:0 30px 60px -20px rgba(30,10,80,.55),inset 0 1px 0 rgba(255,255,255,.8);padding:26px;animation:maIn .8s .12s cubic-bezier(.2,.8,.2,1) both}" +
    "@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.ma-card{background:rgba(255,255,255,.96)}}" +
    ".ma-card h2{font:700 24px/1.2 var(--x-round,Fredoka,system-ui);margin:0 0 4px}.ma-sub{margin:0 0 18px;color:#5E5785;font-weight:600;font-size:15px}" +
    ".ma-tabs{position:relative;display:grid;grid-template-columns:1fr 1fr;background:rgba(124,77,255,.12);border-radius:999px;padding:5px;margin-bottom:18px}" +
    ".ma-tabs::before{content:'';position:absolute;top:5px;bottom:5px;left:5px;width:calc(50% - 5px);border-radius:999px;background:#fff;box-shadow:0 4px 14px rgba(76,43,184,.25);transition:transform .38s cubic-bezier(.3,1.3,.5,1)}" +
    ".ma-tabs[data-tab=up]::before{transform:translateX(100%)}" +
    ".ma-tabs button{position:relative;z-index:1;border:0;border-radius:999px;min-height:44px;padding:10px;font:800 16px/1 var(--x-body,Nunito,system-ui);background:transparent;cursor:pointer;color:#5E5785;transition:color .25s}" +
    ".ma-tabs button[aria-selected=true]{color:#5A2FD6}" +
    ".ma-f{display:grid;gap:14px;margin:0}.ma-f.ma-anim{animation:maSwap .4s cubic-bezier(.2,.8,.2,1) both}@keyframes maSwap{from{opacity:0;transform:translateX(var(--dx,16px))}to{opacity:1;transform:none}}" +
    ".ma-fld{display:grid;gap:6px;min-width:0}.ma-fld>span:first-child{font-weight:800;font-size:14px;color:#2B2350;transition:color .2s}.ma-fld:focus-within>span:first-child{color:#7C4DFF}" +
    ".ma-in{position:relative;display:flex;align-items:center}.ma-in>svg{position:absolute;left:14px;width:20px;height:20px;color:#9A93BE;pointer-events:none;transition:color .2s,transform .2s}" +
    ".ma-in:focus-within>svg{color:#7C4DFF;transform:scale(1.1)}" +
    ".ma-f input,.ma-f select{box-sizing:border-box;width:100%;min-width:0;min-height:50px;font:600 16px/1.2 var(--x-body,Nunito,system-ui);color:#2B2350;padding:12px 14px 12px 44px;border:2px solid rgba(43,35,80,.14);border-radius:14px;background:rgba(255,255,255,.9);transition:border-color .2s,box-shadow .2s,background .2s;-webkit-appearance:none;appearance:none}" +
    ".ma-f select{padding-left:14px;background-image:linear-gradient(45deg,transparent 50%,#5E5785 50%),linear-gradient(135deg,#5E5785 50%,transparent 50%);background-position:calc(100% - 20px) 50%,calc(100% - 14px) 50%;background-size:6px 6px;background-repeat:no-repeat}" +
    ".ma-f input::placeholder{color:#A9A3C7}.ma-f input:hover,.ma-f select:hover{border-color:rgba(124,77,255,.4)}" +
    ".ma-f input:focus,.ma-f select:focus{outline:none;border-color:#7C4DFF;background:#fff;box-shadow:0 0 0 4px rgba(124,77,255,.18)}" +
    ".ma-f .ma-bad input{border-color:#E5484D;box-shadow:0 0 0 4px rgba(229,72,77,.14)}" +
    ".ma-pw input{padding-right:56px}.ma-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:12px;background:transparent;color:#7A73A3;display:grid;place-items:center;cursor:pointer;transition:background .2s,color .2s}" +
    ".ma-eye:hover{background:rgba(124,77,255,.1);color:#5A2FD6}.ma-eye svg{width:22px;height:22px}.ma-eye .ma-off{display:none}.ma-eye[aria-pressed=true] .ma-on{display:none}.ma-eye[aria-pressed=true] .ma-off{display:block}" +
    ".ma-row2{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}.ma-gate .ma-btn{color:#fff}.ma-gate .ma-roles label{color:#2B2350}.ma-gate .ma-roles label:has(input:checked){color:#5A2FD6}" +
    ".ma-roles{display:flex;gap:8px;flex-wrap:wrap}.ma-roles label{display:flex;align-items:center;gap:6px;min-height:44px;box-sizing:border-box;border:2px solid rgba(43,35,80,.14);border-radius:999px;padding:6px 14px;cursor:pointer;font-weight:800;background:rgba(255,255,255,.8);transition:all .2s}" +
    ".ma-roles input{accent-color:#7C4DFF;width:18px;height:18px;min-height:0;padding:0;margin:0;-webkit-appearance:auto;appearance:auto}.ma-roles label:has(input:checked){background:#EFE8FF;border-color:#7C4DFF;color:#5A2FD6}" +
    ".ma-err{color:#C62828;font-weight:800;font-size:14px;min-height:1.2em;margin:-4px 0 -4px}.ma-err:empty{min-height:0;margin:0}" +
    ".ma-btn{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:52px;border:0;border-radius:16px;cursor:pointer;color:#fff;font:800 17px/1 var(--x-body,Nunito,system-ui);letter-spacing:.2px;" +
    "background:linear-gradient(135deg,#7C4DFF,#5A2FD6);box-shadow:0 10px 24px -8px rgba(90,47,214,.7);transition:transform .15s,box-shadow .2s,filter .2s;overflow:hidden}" +
    ".ma-btn--teal{background:linear-gradient(135deg,#14C8B4,#0C9787);box-shadow:0 10px 24px -8px rgba(12,151,135,.7)}" +
    ".ma-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);transform:translateX(-100%);transition:transform .7s}" +
    ".ma-btn:hover{transform:translateY(-2px);box-shadow:0 14px 28px -8px rgba(90,47,214,.75);filter:brightness(1.05)}.ma-btn:hover::after{transform:translateX(100%)}" +
    ".ma-btn:active{transform:translateY(1px) scale(.98);box-shadow:0 4px 10px -4px rgba(90,47,214,.7)}.ma-btn:focus-visible{outline:3px solid #FFC93C;outline-offset:3px}" +
    ".ma-btn:disabled{cursor:progress;filter:saturate(.8);transform:none}.ma-spin{width:20px;height:20px;border-radius:50%;border:3px solid rgba(255,255,255,.4);border-top-color:#fff;animation:maSpin .7s linear infinite}" +
    "@keyframes maSpin{to{transform:rotate(360deg)}}" +
    ".ma-shake{animation:maShake .45s cubic-bezier(.36,.07,.19,.97) both!important}@keyframes maShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-8px)}40%,60%{transform:translateX(8px)}}" +
    "@media (max-width:820px){.ma-wrap{grid-template-columns:minmax(0,1fr);gap:16px;padding:20px 16px 28px;align-content:center;max-width:480px}.ma-hero img{width:110px}.ma-hero h1{font-size:30px;margin:4px 0 2px}.ma-hero p{font-size:14px}.ma-chips{display:none}}" +
    "@media (max-width:430px){.ma-wrap{padding:14px 12px 24px}.ma-card{padding:20px 16px;border-radius:22px}.ma-card h2{font-size:21px}.ma-sub{font-size:14px;margin-bottom:14px}.ma-hero{display:flex;align-items:center;justify-content:center;gap:10px;text-align:left}.ma-hero img{width:64px;margin:0;flex:none}.ma-hero h1{font-size:26px}.ma-hero p{font-size:13px}}" +
    "@media (max-height:520px) and (max-width:820px){.ma-hero{display:none}}" +
    "@media (prefers-reduced-motion:reduce){.ma-gate,.ma-gate *,.ma-gate *::before,.ma-gate *::after{animation:none!important;transition:none!important}.ma-sym{display:none}.ma-spin{animation:maSpin 1.5s linear infinite!important}}" +
    ".ma-user{display:inline-flex;align-items:center;gap:8px}" +
    ".ma-user button{border:3px solid #2B2350;border-radius:999px;background:#fff;padding:6px 12px;font-weight:800;cursor:pointer;box-shadow:0 3px 0 #2B2350}" +
    /* admin */
    ".ad-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 16px}.ad-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}" +
    ".ad-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-bottom:12px}.ad-tools input,.ad-tools select,.ad-in{font:600 15px inherit;padding:9px 12px;border:3px solid #2B2350;border-radius:12px;background:#fff;min-width:0}" +
    ".ad-tools label{display:grid;gap:4px;font-weight:800;font-size:14px}.ad-act{display:flex;gap:6px;flex-wrap:wrap}.ad-q{border:3px solid #2B2350;border-radius:16px;padding:12px;margin-bottom:10px;background:#fff}" +
    ".ad-q textarea{width:100%;box-sizing:border-box;font:inherit;padding:8px;border:2px solid #2B2350;border-radius:10px;min-height:60px}.ad-cls{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}" +
    ".ad-cls label{display:flex;justify-content:space-between;align-items:center;border:3px solid #2B2350;border-radius:16px;padding:12px;font-weight:800;background:#fff}.ad-cls input{width:22px;height:22px;accent-color:#3DDC84}" +
    ".ad-log{list-style:none;padding:0;margin:0;display:grid;gap:6px}.ad-log li{padding:8px 10px;border-radius:12px;background:#F6F2FF}.ad-small{font-size:13px;color:#5b5878}";
  document.head.appendChild(css);

  /* ---------- gate (login / signup) ---------- */
  var ICON = {
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    eye: '<svg class="ma-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
         '<svg class="ma-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
  };
  var fld = function (label, input, icon, pw) {
    return '<label class="ma-fld"><span>' + label + '</span><span class="ma-in' + (pw ? " ma-pw" : "") + '">' + ICON[icon] + input +
      (pw ? '<button type="button" class="ma-eye" data-eye="' + pw + '" aria-label="Show password" aria-pressed="false">' + ICON.eye + "</button>" : "") + "</span></label>";
  };
  var SYMS = ["π", "∑", "√", "÷", "×", "+", "=", "∞", "%", "x²", "∫", "θ", "½", "Δ", "7", "3"], symHtml = "";
  for (var si = 0; si < 16; si++) symHtml += '<span class="ma-sym" style="left:' + ((si * 37 + 5) % 96) + "%;font-size:" + (20 + (si * 7) % 22) + "px;animation-duration:" + (16 + (si * 5) % 14) + "s;animation-delay:-" + ((si * 3.7) % 20).toFixed(1) + 's">' + SYMS[si] + "</span>";
  var gate = document.createElement("div");
  gate.className = "ma-gate"; gate.setAttribute("role", "dialog"); gate.setAttribute("aria-modal", "true"); gate.setAttribute("aria-labelledby", "ma-title");
  gate.innerHTML =
    '<div class="ma-bg" aria-hidden="true"><span class="ma-blob b1"></span><span class="ma-blob b2"></span><span class="ma-blob b3"></span>' + symHtml + "</div>" +
    '<div class="ma-wrap"><div class="ma-hero"><img src="' + OWL + '" alt="Quizzy the Owl waving" /><div><h1 id="ma-title">MathQuest</h1><p>Learn. Play. Solve. Master. · CBSE Class 9 &amp; 10</p></div>' +
    '<div class="ma-chips" aria-hidden="true"><span>⭐ Earn XP</span><span>🔥 Keep streaks</span><span>🏆 Win badges</span></div></div>' +
    '<div class="ma-card"><h2 id="ma-head">Welcome back 👋</h2><p class="ma-sub" id="ma-subt">Log in to continue your maths quest.</p>' +
    '<div class="ma-tabs" role="tablist" data-tab="in"><button type="button" role="tab" id="ma-t-in" aria-selected="true" aria-controls="ma-login">Log in</button><button type="button" role="tab" id="ma-t-up" aria-selected="false" aria-controls="ma-signup">Sign up</button></div>' +
    '<form class="ma-f" id="ma-login" novalidate>' +
    fld("Email", '<input type="email" id="ma-le" inputmode="email" autocomplete="username" autocapitalize="off" spellcheck="false" required placeholder="you@example.com" />', "mail") +
    fld("Password", '<input type="password" id="ma-lp" autocomplete="current-password" autocapitalize="off" required placeholder="Your password" />', "lock", "ma-lp") +
    '<p class="ma-err" id="ma-lerr" role="alert"></p><button class="ma-btn" type="button" data-sub="1" id="ma-lgo">Log in 🚀</button></form>' +
    '<form class="ma-f" id="ma-signup" novalidate hidden>' +
    fld("Full name", '<input id="ma-sn" autocomplete="name" required placeholder="Your name" />', "user") +
    fld("Email", '<input type="email" id="ma-se" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" required placeholder="you@example.com" />', "mail") +
    '<div class="ma-row2">' + fld("Password", '<input type="password" id="ma-sp" autocomplete="new-password" required placeholder="8+ chars, 1 number" />', "lock", "ma-sp") +
    fld("Confirm password", '<input type="password" id="ma-sp2" autocomplete="new-password" required placeholder="Type it again" />', "lock", "ma-sp2") + "</div>" +
    '<fieldset style="border:0;padding:0;margin:0;min-width:0"><legend style="font-weight:800;font-size:14px;color:#2B2350;margin-bottom:6px;padding:0">I am a</legend><div class="ma-roles">' +
    '<label><input type="radio" name="ma-role" value="STUDENT" checked /> 🎒 Student</label><label><input type="radio" name="ma-role" value="PARENT" /> 👪 Parent</label><label><input type="radio" name="ma-role" value="TEACHER" /> 🧑‍🏫 Teacher</label></div></fieldset>' +
    '<label class="ma-fld" id="ma-clsw"><span>Class</span><select id="ma-scls"><option value="9">Class 9</option><option value="10">Class 10</option></select></label>' +
    '<p class="ma-err" id="ma-serr" role="alert"></p><button class="ma-btn ma-btn--teal" type="button" data-sub="1" id="ma-sgo">Create account ✨</button></form>' +
    "</div></div>";
  document.body.appendChild(gate);
  var app = q(".x-app"); if (app) app.setAttribute("aria-hidden", "true");

  function tabGate(up) {
    var wasUp = !q("#ma-signup").hidden, f = up ? q("#ma-signup") : q("#ma-login");
    q("#ma-login").hidden = up; q("#ma-signup").hidden = !up; q("#ma-t-in").setAttribute("aria-selected", !up); q("#ma-t-up").setAttribute("aria-selected", up);
    q(".ma-tabs", gate).setAttribute("data-tab", up ? "up" : "in");
    q("#ma-head").textContent = up ? "Create your account ✨" : "Welcome back 👋";
    q("#ma-subt").textContent = up ? "Join free and start earning XP today." : "Log in to continue your maths quest.";
    q("#ma-lerr").textContent = ""; q("#ma-serr").textContent = "";
    if (wasUp !== up) { f.style.setProperty("--dx", up ? "24px" : "-24px"); f.classList.remove("ma-anim"); void f.offsetWidth; f.classList.add("ma-anim"); }
    if (window.matchMedia && !window.matchMedia("(pointer:coarse)").matches) setTimeout(function () { (up ? q("#ma-sn") : q("#ma-le")).focus(); }, 0);
  }
  q("#ma-t-in").onclick = function () { tabGate(false); }; q("#ma-t-up").onclick = function () { tabGate(true); };
  q(".ma-tabs", gate).addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { var up = e.key === "ArrowRight"; tabGate(up); q(up ? "#ma-t-up" : "#ma-t-in").focus(); } });
  gate.addEventListener("click", function (e) {
    var b = e.target.closest("[data-eye]"); if (!b) return; e.preventDefault();
    var i = q("#" + b.getAttribute("data-eye")), show = i.type === "password", pos = i.selectionStart;
    i.type = show ? "text" : "password"; b.setAttribute("aria-pressed", show); b.setAttribute("aria-label", show ? "Hide password" : "Show password");
    try { i.focus(); if (pos != null) i.setSelectionRange(pos, pos); } catch (x) {}
  });
  qa('input[name="ma-role"]', gate).forEach(function (r) { r.onchange = function () { q("#ma-clsw").hidden = r.value !== "STUDENT" || !r.checked; }; });
  // Shake the card and mark the field whenever an error message appears.
  var card = q(".ma-card", gate);
  card.addEventListener("animationend", function (e) { if (e.animationName === "maShake") card.classList.remove("ma-shake"); });
  if (window.MutationObserver) qa(".ma-err", gate).forEach(function (el) {
    new MutationObserver(function () {
      qa(".ma-bad", el.parentNode).forEach(function (x) { x.classList.remove("ma-bad"); });
      if (!el.textContent || /demo mode…$/.test(el.textContent)) return;
      card.classList.remove("ma-shake"); void card.offsetWidth; card.classList.add("ma-shake");
      var a = document.activeElement; if (a && a.closest && a.closest(".ma-fld") && el.parentNode.contains(a)) a.closest(".ma-in, .ma-fld").classList.add("ma-bad");
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });
  // Backend: the live same-origin API by default; quietly falls back to the in-browser demo if it can't be reached.
  var MODE = API && API.connect ? "server" : "demo";
  var mode = function () { return MODE; };
  function setMode(m) { MODE = m; }
  var apiBase = function () { return String((API && API.base) || "").replace(/\/+$/, ""); };
  if (API && API.ready) API.ready.then(function (ok) { if (!ok && !API.on) setMode("demo"); });
  var emailOk = function (e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); };
  function busy(btn, on, txt) {
    btn.disabled = on; btn.setAttribute("aria-busy", on);
    if (on) { if (!btn.dataset.t) btn.dataset.t = btn.innerHTML; btn.innerHTML = '<span class="ma-spin" aria-hidden="true"></span>' + esc(txt); }
    else if (btn.dataset.t) { btn.innerHTML = btn.dataset.t; delete btn.dataset.t; }
  }

  q("#ma-login").addEventListener("submit", function (e) {
    e.preventDefault();
    var em = q("#ma-le").value.trim().toLowerCase(), pw = q("#ma-lp").value.replace(/^\s+|\s+$/g, ""), err = q("#ma-lerr"), btn = q("#ma-lgo"); err.textContent = "";
    if (!emailOk(em)) { err.textContent = "Enter a valid email."; q("#ma-le").focus(); return; }
    if (!pw) { err.textContent = "Enter your password."; q("#ma-lp").focus(); return; }
    if (mode() === "server") {
      if (!API || !API.connect) { err.textContent = "Backend bridge missing."; return; }
      busy(btn, true, "Logging in…");
      API.connect(apiBase(), em, pw).then(function () {
        var u = API.user || {}; start({ id: u.id || u._id, name: u.name, email: u.email, role: u.role }, "server");
      }).catch(function (x) {
        busy(btn, false);
        if (x.network) { setMode("demo"); err.textContent = "Live server unreachable, logging in to demo mode…"; fakeSubmit(q("#ma-login")); return; }
        err.textContent = x.message || "Login failed";
      }).then(function () { busy(btn, false); });
      return;
    }
    var u = USERS.filter(function (x) { return x.email === em; })[0];
    if (!u || u.hash !== hashPw(pw)) { err.textContent = "Wrong email or password."; return; }
    if (u.blocked) { err.textContent = "This account is blocked. Contact the admin."; return; }
    u.last = Date.now(); logAct(u.name + " logged in"); start(u, "demo");
  });

  q("#ma-signup").addEventListener("submit", function (e) {
    e.preventDefault();
    var n = q("#ma-sn").value.trim(), em = q("#ma-se").value.trim().toLowerCase(), p = q("#ma-sp").value, p2 = q("#ma-sp2").value, err = q("#ma-serr"), btn = q("#ma-sgo");
    var role = q('input[name="ma-role"]:checked', gate).value, cls = role === "STUDENT" ? +q("#ma-scls").value : null; err.textContent = "";
    if (n.length < 2) { err.textContent = "Enter your name (2+ letters)."; q("#ma-sn").focus(); return; }
    if (!emailOk(em)) { err.textContent = "Enter a valid email."; q("#ma-se").focus(); return; }
    if (p.length < 8 || !/\d/.test(p) || !/[a-z]/i.test(p)) { err.textContent = "Password needs 8+ characters with a letter and a number."; q("#ma-sp").focus(); return; }
    if (p !== p2) { err.textContent = "Passwords don’t match."; q("#ma-sp2").focus(); return; }
    if (mode() === "server") {
      var base = apiBase(); busy(btn, true, "Creating…");
      var body = { name: n, email: em, password: p, role: role };
      API.call("GET", "/classes").then(function (cl) { var k = (cl || []).filter(function (x) { return x.order === cls || x.classNo === cls; })[0]; if (k) body.classLevelId = k._id; }).catch(function () {})
        .then(function () { return API.call("POST", "/auth/register", body); })
        .then(function () { return API.connect(base, em, p); })
        .then(function () { var u = API.user || {}; start({ id: u.id, name: u.name, email: u.email, role: u.role }, "server"); })
        .catch(function (x) { err.textContent = x.message || "Sign up failed"; }).then(function () { busy(btn, false); });
      return;
    }
    if (USERS.some(function (x) { return x.email === em; })) { err.textContent = "That email is already registered. Log in instead."; return; }
    var u = { id: "u" + (++uidN), name: n, email: em, hash: hashPw(p), role: role, cls: cls, blocked: false, at: Date.now(), last: Date.now() };
    USERS.push(u); logAct("New " + ROLE_LABEL[role].toLowerCase() + " signed up: " + n); start(u, "demo");
  });

  /* ---------- session ---------- */
  var top = q(".x-stats"), chip = document.createElement("span"); chip.className = "ma-user"; if (top) top.appendChild(chip);
  var nav = q("#x-nav"), main = q("#x-main");
  var adBtn = document.createElement("button"); adBtn.type = "button"; adBtn.setAttribute("data-go", "admin"); adBtn.hidden = true;
  adBtn.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4l22 8v16c0 14-9 26-22 32C19 54 10 42 10 28V12z" fill="#7C4DFF" stroke="#2B2350" stroke-width="3.5" stroke-linejoin="round"/><circle cx="32" cy="28" r="7" fill="#FFC93C" stroke="#2B2350" stroke-width="3"/><path d="M21 46q2-9 11-9t11 9" fill="#FFC93C" stroke="#2B2350" stroke-width="3"/></svg>Admin';
  if (nav) nav.appendChild(adBtn);
  var adScr = document.createElement("section"); adScr.className = "x-screen"; adScr.id = "scr-admin"; adScr.hidden = true; adScr.setAttribute("aria-labelledby", "h-admin");
  if (main) main.appendChild(adScr);

  function start(u, m) {
    session = { user: u, mode: m };
    gate.hidden = true; if (app) app.removeAttribute("aria-hidden");
    q("#ma-lp").value = ""; q("#ma-sp").value = ""; q("#ma-sp2").value = "";
    chip.innerHTML = '<span class="x-pill" title="' + esc(u.email) + '">👤 ' + esc(u.name.split(" ")[0]) + " · " + esc(ROLE_LABEL[u.role] || u.role) + '</span><button type="button" id="ma-out">Log out</button>';
    q("#ma-out").onclick = logout;
    var admin = isAdmin(u.role); adBtn.hidden = !admin;
    var go = window.MQ_go || function () {};
    if (admin) { renderAdmin("overview"); go("admin"); }
    else go(u.role === "TEACHER" ? "teacher" : u.role === "PARENT" ? "parent" : "home");
  }
  function logout() {
    if (session && session.user) logAct(session.user.name + " logged out");
    if (session && session.mode === "server" && API && API.useDemo) API.useDemo();
    session = null; adBtn.hidden = true; chip.innerHTML = "";
    if (window.MQ_go) window.MQ_go("home");
    gate.hidden = false; if (app) app.setAttribute("aria-hidden", "true"); tabGate(false);
  }
  window.MQ_AUTH = { session: function () { return session; }, logout: logout, hashPw: hashPw };

  /* ================= ADMIN PANEL ================= */
  var adTab = "overview", contentSel = { cls: 9, ch: 0, tp: 0 };
  function toast(m) { var t = q("#ad-toast"); if (!t) return; t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600); }

  /* data layer: same calls for demo + server */
  var DS = {
    stats: function () {
      if (server()) return API.call("GET", "/admin/stats");
      var by = {}; USERS.forEach(function (u) { by[u.role] = (by[u.role] || 0) + 1; });
      var topics = 0, qs = 0; DATA.forEach(function (c) { topics += c.topics.length; c.topics.forEach(function (t) { qs += t.quiz.length; }); });
      return Promise.resolve({ users: USERS.length, byRole: by, blocked: USERS.filter(function (u) { return u.blocked; }).length, chapters: DATA.length, topics: topics, questions: qs, attempts: MQ.answered || 0, accuracy: MQ.answered ? Math.round(MQ.correct / MQ.answered * 100) : 0, activeClasses: CLASSES.filter(function (c) { return c.active; }).length });
    },
    users: function (search, role) {
      if (server()) return API.call("GET", "/admin/users?limit=100" + (search ? "&search=" + encodeURIComponent(search) : "") + (role ? "&role=" + role : "")).then(function (d) { return (d.items || []).map(function (u) { return { id: u._id, name: u.name, email: u.email, role: u.role, cls: u.classNo || null, blocked: !!u.isBlocked, at: u.createdAt }; }); });
      var s = (search || "").toLowerCase();
      return Promise.resolve(USERS.filter(function (u) { return (!role || u.role === role) && (!s || (u.name + " " + u.email).toLowerCase().indexOf(s) > -1); }));
    },
    updateUser: function (id, patch) {
      if (server()) return API.call("PATCH", "/admin/users/" + id, { role: patch.role, isBlocked: patch.blocked });
      var u = USERS.filter(function (x) { return x.id === id; })[0]; if (!u) return Promise.reject(new Error("User not found"));
      if (patch.role) u.role = patch.role; if (patch.blocked != null) u.blocked = patch.blocked; return Promise.resolve(u);
    },
    deleteUser: function (id) {
      if (server()) return API.call("DELETE", "/admin/users/" + id);
      USERS = USERS.filter(function (x) { return x.id !== id; }); return Promise.resolve(true);
    },
    addUser: function (d) {
      if (server()) return API.call("POST", "/admin/users", { name: d.name, email: d.email, password: d.password, role: d.role });
      if (USERS.some(function (x) { return x.email === d.email; })) return Promise.reject(new Error("Email already registered"));
      USERS.push({ id: "u" + (++uidN), name: d.name, email: d.email, hash: hashPw(d.password), role: d.role, cls: d.role === "STUDENT" ? 9 : null, blocked: false, at: Date.now() }); return Promise.resolve(true);
    },
    classes: function () {
      if (server()) return API.call("GET", "/admin/classes").then(function (l) { return (l || []).map(function (c) { return { id: c._id, no: c.classNo || c.number || c.level, active: c.isActive !== false }; }); });
      return Promise.resolve(CLASSES);
    },
    setClass: function (id, on) {
      if (server()) return API.call("PATCH", "/admin/classes/" + id, { isActive: on });
      CLASSES.forEach(function (c) { if (c.id === id) c.active = on; }); return Promise.resolve(true);
    },
    xp: function () { return server() ? API.call("GET", "/admin/settings/xpRules").then(function (d) { return d.value || d; }) : Promise.resolve(XP); },
    saveXp: function (v) { if (server()) return API.call("PUT", "/admin/settings/xpRules", { value: v }); XP = v; return Promise.resolve(true); }
  };

  function renderAdmin(tab) {
    adTab = tab || adTab;
    if (!session || !isAdmin(session.user.role)) { adScr.innerHTML = '<div class="x-card"><h1 class="x-cartoon" id="h-admin">Admin only</h1><p>Log in with an admin account to see this panel.</p></div>'; return; }
    var TABS = [["overview", "📊 Overview"], ["users", "👥 Users"], ["content", "📚 Content"], ["classes", "🏫 Classes"], ["settings", "⚙️ Settings"]];
    adScr.innerHTML = '<div class="x-row x-between" style="flex-wrap:wrap"><div><p class="x-eyebrow">Admin panel · ' + (server() ? "live MongoDB" : "demo data") + '</p><h1 class="x-cartoon" id="h-admin">Hi, ' + esc(session.user.name.split(" ")[0]) + ' 👋</h1></div>' +
      '<span class="x-chip x-chip--purple">' + esc(session.user.email) + "</span></div>" +
      '<div class="ad-tabs" role="tablist" aria-label="Admin sections">' + TABS.map(function (t) { return '<button type="button" class="x-chip" role="tab" data-adtab="' + t[0] + '" aria-selected="' + (t[0] === adTab) + '" aria-pressed="' + (t[0] === adTab) + '">' + t[1] + "</button>"; }).join("") + "</div>" +
      '<p class="x-chip x-chip--green" id="ad-toast" role="status" hidden></p><div id="ad-body"><p class="ad-small">Loading…</p></div>';
    ({ overview: aOverview, users: aUsers, content: aContent, classes: aClasses, settings: aSettings })[adTab]();
  }
  adScr.addEventListener("click", function (e) { var b = e.target.closest("[data-adtab]"); if (b) renderAdmin(b.getAttribute("data-adtab")); });
  var body = function () { return q("#ad-body"); };
  var fail = function (e) { body().innerHTML = '<div class="x-card"><p class="ma-err">Couldn’t load: ' + esc(e.message) + "</p></div>"; };

  function aOverview() {
    DS.stats().then(function (s) {
      var br = s.byRole || {};
      var k = [[s.users, "Total users"], [br.STUDENT || 0, "Students"], [br.TEACHER || 0, "Teachers"], [br.PARENT || 0, "Parents"], [(br.ADMIN || 0) + (br.SUPER_ADMIN || 0), "Admins"], [s.blocked || 0, "Blocked"],
        [s.chapters, "Chapters"], [s.topics, "Topics"], [s.questions, "Questions"], [s.attempts, "Answers given"], [s.accuracy + "%", "Avg accuracy"], [s.activeClasses, "Active classes"]];
      body().innerHTML = '<div class="ad-kpis">' + k.map(function (x) { return '<div class="x-kpi"><b>' + esc(x[0]) + "</b><span>" + esc(x[1]) + "</span></div>"; }).join("") + "</div>" +
        '<div class="x-grid" style="margin-top:16px"><div class="x-card"><p class="x-eyebrow">Recent activity</p><h2 class="x-h2">What’s happening</h2>' +
        (LOG.length ? '<ul class="ad-log">' + LOG.slice(0, 10).map(function (l) { return "<li>" + esc(l.t) + ' <span class="ad-small">· ' + l.at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) + "</span></li>"; }).join("") + "</ul>" : '<p class="ad-small">No activity yet.</p>') + "</div>" +
        '<div class="x-card x-tutor"><div class="x-char"><img src="' + OWL + '" alt="Quizzy the Owl" /></div><p class="x-bubble">Hoo! You manage everything here: users, CBSE content, classes and XP rules.' + (server() ? "" : " Demo changes last until the page reloads.") + "</p></div></div>";
    }).catch(fail);
  }

  function aUsers() {
    body().innerHTML = '<div class="x-card"><div class="ad-tools"><label>Search<input id="ad-us" type="search" placeholder="Name or email" /></label>' +
      '<label>Role<select id="ad-ur"><option value="">All</option><option value="STUDENT">Students</option><option value="TEACHER">Teachers</option><option value="PARENT">Parents</option><option value="ADMIN">Admins</option></select></label></div>' +
      '<div style="overflow-x:auto"><table class="x-table"><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody id="ad-ut"></tbody></table></div></div>' +
      '<div class="x-card"><p class="x-eyebrow">Add user</p><form class="ad-tools" id="ad-add" novalidate><label>Name<input id="ad-an" required /></label><label>Email<input id="ad-ae" type="email" required /></label>' +
      '<label>Password<input id="ad-ap" type="text" required placeholder="8+ chars, 1 number" /></label><label>Role<select id="ad-ar"><option value="STUDENT">Student</option><option value="TEACHER">Teacher</option><option value="PARENT">Parent</option><option value="ADMIN">Admin</option></select></label>' +
      '<button class="x-btn x-btn--teal x-btn--sm" type="button" data-sub="1">＋ Add</button></form><p class="ma-err" id="ad-aerr" role="alert"></p></div>';
    var load = function () {
      DS.users(q("#ad-us").value.trim(), q("#ad-ur").value).then(function (list) {
        q("#ad-ut").innerHTML = list.length ? list.map(function (u) {
          var me = session.user.email === u.email;
          return "<tr><th scope=\"row\">" + esc(u.name) + (u.cls ? ' <span class="ad-small">· Class ' + u.cls + "</span>" : "") + "</th><td>" + esc(u.email) + "</td>" +
            '<td><select class="ad-in" data-role="' + u.id + '" aria-label="Role for ' + esc(u.name) + '"' + (me ? " disabled" : "") + ">" + ["STUDENT", "TEACHER", "PARENT", "ADMIN"].concat(u.role === "SUPER_ADMIN" ? ["SUPER_ADMIN"] : []).map(function (r) { return "<option value=\"" + r + "\"" + (r === u.role ? " selected" : "") + ">" + ROLE_LABEL[r] + "</option>"; }).join("") + "</select></td>" +
            '<td><span class="x-chip ' + (u.blocked ? "x-chip--coral" : "x-chip--green") + '">' + (u.blocked ? "Blocked" : "Active") + "</span></td>" +
            '<td><div class="ad-act">' + (me ? '<span class="ad-small">You</span>' : '<button type="button" class="x-btn x-btn--sm x-btn--ghost" data-block="' + u.id + '" data-v="' + (!u.blocked) + '">' + (u.blocked ? "Unblock" : "Block") + '</button><button type="button" class="x-btn x-btn--sm x-btn--coral" data-del="' + u.id + '" data-n="' + esc(u.name) + '">Delete</button>') + "</div></td></tr>";
        }).join("") : '<tr><td colspan="5" class="ad-small">No users match.</td></tr>';
      }).catch(fail);
    };
    var tmr; q("#ad-us").oninput = function () { clearTimeout(tmr); tmr = setTimeout(load, 250); }; q("#ad-ur").onchange = load;
    q("#ad-ut").addEventListener("change", function (e) { var s = e.target.closest("[data-role]"); if (!s) return; DS.updateUser(s.getAttribute("data-role"), { role: s.value }).then(function () { logAct("Role changed to " + ROLE_LABEL[s.value]); toast("Role updated ✓"); }).catch(function (x) { toast(x.message); load(); }); });
    q("#ad-ut").addEventListener("click", function (e) {
      var b = e.target.closest("[data-block]"), d = e.target.closest("[data-del]");
      if (b) DS.updateUser(b.getAttribute("data-block"), { blocked: b.getAttribute("data-v") === "true" }).then(function () { toast(b.getAttribute("data-v") === "true" ? "User blocked" : "User unblocked"); logAct("User " + (b.getAttribute("data-v") === "true" ? "blocked" : "unblocked")); load(); }).catch(function (x) { toast(x.message); });
      if (d && window.confirm("Delete " + d.getAttribute("data-n") + "? This can’t be undone.")) DS.deleteUser(d.getAttribute("data-del")).then(function () { logAct("Deleted user " + d.getAttribute("data-n")); toast("User deleted"); load(); }).catch(function (x) { toast(x.message); });
    });
    q("#ad-add").addEventListener("submit", function (e) {
      e.preventDefault(); var n = q("#ad-an").value.trim(), em = q("#ad-ae").value.trim().toLowerCase(), p = q("#ad-ap").value, r = q("#ad-ar").value, er = q("#ad-aerr"); er.textContent = "";
      if (n.length < 2 || !emailOk(em)) { er.textContent = "Enter a name and a valid email."; return; }
      if (p.length < 8 || !/\d/.test(p)) { er.textContent = "Password needs 8+ characters with a number."; return; }
      DS.addUser({ name: n, email: em, password: p, role: r }).then(function () { logAct("Added " + ROLE_LABEL[r].toLowerCase() + " " + n); toast("User added ✓"); q("#ad-add").reset(); load(); }).catch(function (x) { er.textContent = x.message; });
    });
    load();
  }

  /* ---------- Content: chapters, topics, questions (demo = this tab; server = MongoDB) ---------- */
  var SV = { cur: {}, qs: {} }; // server ids: SV.cur[cls] = admin curriculum; SV.qs[topicSlug] = full questions
  function svChapter(cls, chNo) { var c = SV.cur[cls]; return c && c.chapters.filter(function (x) { return x.chapterNo === chNo; })[0]; }
  function svTopic(cls, chNo, slug) { var c = svChapter(cls, chNo); return c && c.topics.filter(function (x) { return x.slug === slug; })[0]; }
  function loadServer(cls, force) {
    if (!server()) return Promise.resolve();
    if (SV.cur[cls] && !force) return Promise.resolve();
    return API.call("GET", "/admin/curriculum?class=" + cls).then(function (d) { SV.cur[cls] = d; });
  }
  function loadServerQs(cls, ch, tp) {
    if (!server()) return Promise.resolve(null);
    var st = svTopic(cls, ch.chapterNo, tp.id); if (!st) return Promise.resolve(null);
    return API.call("GET", "/admin/topics/" + st._id + "/questions").then(function (l) { SV.qs[tp.id] = l || []; return SV.qs[tp.id]; });
  }
  function svQid(tp, i) { var l = SV.qs[tp.id] || [], Q = tp.quiz[i]; if (!Q) return null; var m = l.filter(function (x) { return x.text === Q.q; })[0] || l[i]; return m ? m._id : null; }
  function refreshLearn() {
    try { var b = q('#x-classes [data-cbcls][aria-pressed="true"]') || q("#x-classes [data-cbcls]"); if (b) b.click(); } catch (e) {}
    if (window.MQ_renderAll) window.MQ_renderAll();
  }
  var COLORS = ["#7C4DFF", "#14C8B4", "#FF6B6B", "#FFC93C", "#3DDC84", "#4D9DFF", "#FF8A3D", "#E056FD"];

  function aContent() {
    var chs = function () { return DATA.filter(function (c) { return c.class === contentSel.cls; }).sort(function (a, b) { return a.chapterNo - b.chapterNo; }); };
    var draw = function () {
      var list = chs(); if (contentSel.ch >= list.length) contentSel.ch = 0;
      var ch = list[contentSel.ch] || null, tp = null;
      if (ch) { if (contentSel.tp >= ch.topics.length) contentSel.tp = 0; tp = ch.topics[contentSel.tp] || null; }
      var where = server() ? "Saves to MongoDB" : "Demo mode: changes last until the page reloads";
      body().innerHTML =
        '<div class="x-card"><div class="ad-tools"><label>Class<select id="ad-cc"><option value="9"' + (contentSel.cls === 9 ? " selected" : "") + '>Class 9</option><option value="10"' + (contentSel.cls === 10 ? " selected" : "") + ">Class 10</option></select></label>" +
        '<label>Chapter<select id="ad-cch">' + (list.length ? list.map(function (c, i) { return '<option value="' + i + '"' + (i === contentSel.ch ? " selected" : "") + ">" + c.chapterNo + ". " + esc(c.chapter) + " (" + c.topics.length + ")</option>"; }).join("") : "<option>No chapters</option>") + "</select></label>" +
        '<label>Topic<select id="ad-ctp">' + (tp ? ch.topics.map(function (t, i) { return '<option value="' + i + '"' + (i === contentSel.tp ? " selected" : "") + ">" + t.icon + " " + esc(t.name) + " (" + t.quiz.length + " Q)</option>"; }).join("") : "<option>No topics</option>") + "</select></label></div>" +
        '<div class="ad-act"><button type="button" class="x-btn x-btn--sm x-btn--teal" data-open-form="ch">＋ New chapter</button>' + (ch ? '<button type="button" class="x-btn x-btn--sm x-btn--teal" data-open-form="tp">＋ New topic</button>' : "") +
        (tp ? '<button type="button" class="x-btn x-btn--sm x-btn--yellow" data-open-form="q">＋ New question</button><button type="button" class="x-btn x-btn--sm x-btn--ghost" data-del-tp>🗑 Delete topic</button>' : "") +
        (ch ? '<button type="button" class="x-btn x-btn--sm x-btn--ghost" data-del-ch>🗑 Delete chapter</button>' : "") + "</div>" +
        '<p class="ad-small" style="margin-top:8px">' + (tp ? tp.steps.length + " lesson steps · " + tp.quiz.length + " questions · " : "") + where + "</p></div>" +
        '<div id="ad-form"></div>' +
        '<div id="ad-qs">' + (tp ? (tp.quiz.length ? tp.quiz.map(function (Q, i) {
          return '<div class="ad-q" data-qi="' + i + '"><div class="x-row x-between"><b>Q' + (i + 1) + " · " + (Q.type === "mcq" ? "MCQ · 1 mark" : "Subjective · 2 marks") + '</b><div class="ad-act"><button type="button" class="x-btn x-btn--sm" data-qedit="' + i + '">Edit</button><button type="button" class="x-btn x-btn--sm x-btn--coral" data-qdel="' + i + '">Delete</button></div></div>' +
            "<p>" + esc(Q.q) + "</p>" + (Q.type === "mcq" ? '<p class="ad-small">' + Q.options.map(function (o, k) { return (k === Q.answer ? "✅ " : "• ") + esc(o); }).join(" &nbsp; ") + "</p>" : '<p class="ad-small">Keywords: ' + esc((Q.keywords || []).join(", ")) + "</p>") + "</div>";
        }).join("") : '<div class="x-card"><p class="ad-small">No questions yet. Tap <b>＋ New question</b>. The topic quiz uses the first 5.</p></div>') : "") + "</div>";

      q("#ad-cc").onchange = function () { contentSel = { cls: +this.value, ch: 0, tp: 0 }; loadServer(contentSel.cls).then(draw, draw); };
      q("#ad-cch").onchange = function () { contentSel.ch = +this.value; contentSel.tp = 0; draw(); };
      q("#ad-ctp").onchange = function () { contentSel.tp = +this.value; draw(); };
      if (tp && server() && !SV.qs[tp.id]) loadServerQs(contentSel.cls, ch, tp).catch(function () {});

      body().querySelector(".ad-act").onclick = function (e) {
        var f = e.target.closest("[data-open-form]");
        if (f) { openForm(f.getAttribute("data-open-form"), ch, tp); return; }
        if (e.target.closest("[data-del-tp]") && window.confirm("Delete topic “" + tp.name + "” and its questions?")) {
          var st = server() && svTopic(contentSel.cls, ch.chapterNo, tp.id);
          (st ? API.call("DELETE", "/admin/topics/" + st._id) : Promise.resolve()).then(function () {
            ch.topics.splice(contentSel.tp, 1); contentSel.tp = 0; delete MQ.topics[tp.id];
            logAct("Deleted topic " + tp.name); toast("Topic deleted"); refreshLearn(); return loadServer(contentSel.cls, true);
          }).then(draw).catch(function (x) { toast(x.message); });
        }
        if (e.target.closest("[data-del-ch]") && window.confirm("Delete chapter “" + ch.chapter + "” with all " + ch.topics.length + " topics?")) {
          var sc = server() && svChapter(contentSel.cls, ch.chapterNo);
          (sc ? API.call("DELETE", "/admin/chapters/" + sc._id) : Promise.resolve()).then(function () {
            DATA.splice(DATA.indexOf(ch), 1); contentSel.ch = 0; contentSel.tp = 0;
            logAct("Deleted chapter " + ch.chapter); toast("Chapter deleted"); refreshLearn(); return loadServer(contentSel.cls, true);
          }).then(draw).catch(function (x) { toast(x.message); });
        }
      };

      q("#ad-qs").onclick = function (e) {
        var ed = e.target.closest("[data-qedit]"), dl = e.target.closest("[data-qdel]"), sv = e.target.closest("[data-qsave]");
        if (dl && window.confirm("Delete this question?")) {
          var di = +dl.getAttribute("data-qdel"), sid = server() ? svQid(tp, di) : null;
          (sid ? API.call("DELETE", "/admin/questions/" + sid) : Promise.resolve()).then(function () {
            tp.quiz.splice(di, 1); if (SV.qs[tp.id]) delete SV.qs[tp.id]; logAct("Deleted a question in " + tp.name); toast("Question deleted"); draw();
          }).catch(function (x) { toast(x.message); });
        }
        if (ed) {
          var i = +ed.getAttribute("data-qedit"), Q = tp.quiz[i], box = q('[data-qi="' + i + '"]');
          box.innerHTML = '<label class="ad-small" style="display:grid;gap:4px">Question<textarea data-f="q">' + esc(Q.q) + "</textarea></label>" +
            (Q.type === "mcq" ? '<div class="ad-tools" style="margin-top:8px">' + Q.options.map(function (o, k) { return '<label>Option ' + "ABCD"[k] + '<input class="ad-in" data-f="o' + k + '" value="' + esc(o) + '" /></label>'; }).join("") + '<label>Correct<select class="ad-in" data-f="a">' + Q.options.map(function (o, k) { return '<option value="' + k + '"' + (k === Q.answer ? " selected" : "") + ">" + "ABCD"[k] + "</option>"; }).join("") + "</select></label></div>"
              : '<label class="ad-small" style="display:grid;gap:4px;margin-top:8px">Model answer<textarea data-f="m">' + esc(Q.modelAnswer || "") + '</textarea></label><label class="ad-small" style="display:grid;gap:4px;margin-top:8px">Keywords (comma separated)<input class="ad-in" data-f="k" value="' + esc((Q.keywords || []).join(", ")) + '" /></label>') +
            '<div class="ad-act" style="margin-top:8px"><button type="button" class="x-btn x-btn--sm x-btn--teal" data-qsave="' + i + '">Save</button><button type="button" class="x-btn x-btn--sm x-btn--ghost" data-qcancel>Cancel</button></div>';
          box.querySelector("textarea").focus();
        }
        if (sv) {
          var j = +sv.getAttribute("data-qsave"), Qs = tp.quiz[j], bx = q('[data-qi="' + j + '"]'), f = function (k) { var el = bx.querySelector('[data-f="' + k + '"]'); return el ? el.value.trim() : ""; };
          if (!f("q")) { toast("Question can’t be empty"); return; }
          var next = { q: f("q") };
          if (Qs.type === "mcq") { next.options = Qs.options.map(function (o, k) { return f("o" + k) || o; }); next.answer = +f("a"); }
          else { next.keywords = f("k").split(",").map(function (s) { return s.trim(); }).filter(Boolean); next.modelAnswer = f("m") || Qs.modelAnswer; }
          var sid2 = server() ? svQid(tp, j) : null;
          (sid2 ? API.call("PUT", "/admin/questions/" + sid2, { text: next.q, options: next.options, correctIndex: next.answer, keywords: next.keywords, modelAnswer: next.modelAnswer }) : Promise.resolve()).then(function () {
            Object.keys(next).forEach(function (k) { Qs[k] = next[k]; }); if (SV.qs[tp.id]) delete SV.qs[tp.id];
            logAct("Edited a question in " + tp.name); toast("Saved ✓"); draw();
          }).catch(function (x) { toast(x.message); });
        }
        if (e.target.closest("[data-qcancel]")) draw();
      };
    };

    function stepRow(n) { return '<div class="ad-step" style="display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px;margin-top:8px"><input class="ad-in" data-st="t" placeholder="Step ' + n + ' title" aria-label="Step ' + n + ' title" /><input class="ad-in" data-st="x" placeholder="Explanation" aria-label="Step ' + n + ' explanation" /><input class="ad-in" data-st="e" placeholder="Example (optional)" aria-label="Step ' + n + ' example" /></div>'; }
    function openForm(kind, ch, tp) {
      var F = q("#ad-form"), html = "";
      if (kind === "ch") html = '<div class="x-card"><p class="x-eyebrow">New chapter · Class ' + contentSel.cls + '</p><form id="ad-fch" novalidate><div class="ad-tools"><label>Chapter name<input class="ad-in" id="ad-chn" placeholder="e.g. Sets" /></label><label>Icon (emoji)<input class="ad-in" id="ad-chi" value="📘" maxlength="4" style="width:80px" /></label>' +
        '<label>Colour<select class="ad-in" id="ad-chc">' + COLORS.map(function (c) { return '<option value="' + c + '" style="background:' + c + '">' + c + "</option>"; }).join("") + '</select></label></div><div class="ad-act"><button class="x-btn x-btn--sm x-btn--teal" type="button" data-sub="1">Create chapter</button><button type="button" class="x-btn x-btn--sm x-btn--ghost" data-fclose>Cancel</button></div><p class="ma-err" id="ad-ferr" role="alert"></p></form></div>';
      if (kind === "tp") html = '<div class="x-card"><p class="x-eyebrow">New topic · ' + esc(ch.chapter) + '</p><form id="ad-ftp" novalidate><div class="ad-tools"><label>Topic name<input class="ad-in" id="ad-tpn" placeholder="e.g. Venn Diagrams" /></label><label>Icon<input class="ad-in" id="ad-tpi" value="📐" maxlength="4" style="width:80px" /></label></div>' +
        '<label class="ad-small" style="display:grid;gap:4px">One-line summary<input class="ad-in" id="ad-tps" placeholder="What the student will learn" /></label>' +
        '<p class="x-h3" style="margin:12px 0 0">Lesson steps</p><div id="ad-steps">' + stepRow(1) + stepRow(2) + stepRow(3) + '</div><button type="button" class="x-btn x-btn--sm x-btn--ghost" id="ad-addstep" style="margin-top:8px">＋ Step</button>' +
        '<div class="ad-act" style="margin-top:12px"><button class="x-btn x-btn--sm x-btn--teal" type="button" data-sub="1">Create topic</button><button type="button" class="x-btn x-btn--sm x-btn--ghost" data-fclose>Cancel</button></div><p class="ma-err" id="ad-ferr" role="alert"></p><p class="ad-small">Then add 3 MCQ + 2 subjective questions so the topic quiz is complete.</p></form></div>';
      if (kind === "q") html = '<div class="x-card"><p class="x-eyebrow">New question · ' + esc(tp.name) + '</p><form id="ad-fq" novalidate><div class="ma-roles" style="margin-bottom:10px"><label><input type="radio" name="ad-qt" value="mcq" checked /> MCQ (1 mark)</label><label><input type="radio" name="ad-qt" value="subjective" /> Subjective (2 marks)</label></div>' +
        '<label class="ad-small" style="display:grid;gap:4px">Question<textarea class="ad-in" id="ad-qq" style="min-height:60px"></textarea></label>' +
        '<div id="ad-qmcq"><div class="ad-tools" style="margin-top:8px">' + [0, 1, 2, 3].map(function (k) { return '<label>Option ' + "ABCD"[k] + '<input class="ad-in" data-opt="' + k + '" /></label>'; }).join("") + '<label>Correct<select class="ad-in" id="ad-qa"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></label></div>' +
        '<label class="ad-small" style="display:grid;gap:4px">Explanation (shown after answering)<input class="ad-in" id="ad-qx" /></label><label class="ad-small" style="display:grid;gap:4px;margin-top:6px">Hint (optional)<input class="ad-in" id="ad-qh" /></label></div>' +
        '<div id="ad-qsub" hidden><label class="ad-small" style="display:grid;gap:4px;margin-top:8px">Model answer (step by step)<textarea class="ad-in" id="ad-qm" style="min-height:80px"></textarea></label>' +
        '<label class="ad-small" style="display:grid;gap:4px;margin-top:6px">Keywords for auto-marking (comma separated)<input class="ad-in" id="ad-qk" placeholder="e.g. 36/60, 48/60, common denominator" /></label></div>' +
        '<div class="ad-act" style="margin-top:12px"><button class="x-btn x-btn--sm x-btn--teal" type="button" data-sub="1">Add question</button><button type="button" class="x-btn x-btn--sm x-btn--ghost" data-fclose>Cancel</button></div><p class="ma-err" id="ad-ferr" role="alert"></p></form></div>';
      F.innerHTML = html;
      var first = F.querySelector("input:not([type=radio]),textarea"); if (first) first.focus();
      F.onclick = function (e) { if (e.target.closest("[data-fclose]")) F.innerHTML = ""; if (e.target.closest("#ad-addstep")) { var s = q("#ad-steps"); if (s.children.length < 10) s.insertAdjacentHTML("beforeend", stepRow(s.children.length + 1)); } };
      F.onchange = function (e) { if (e.target.name === "ad-qt") { var sub = e.target.value === "subjective"; q("#ad-qmcq").hidden = sub; q("#ad-qsub").hidden = !sub; } };
      var err = function (m) { q("#ad-ferr").textContent = m; };
      if (kind === "ch") q("#ad-fch").addEventListener("submit", function (e) {
        e.preventDefault(); var n = q("#ad-chn").value.trim(), ic = q("#ad-chi").value.trim() || "📘", col = q("#ad-chc").value;
        if (n.length < 2) return err("Enter a chapter name.");
        if (chs().some(function (c) { return c.chapter.toLowerCase() === n.toLowerCase(); })) return err("That chapter already exists.");
        var no = chs().reduce(function (m, c) { return Math.max(m, c.chapterNo); }, 0) + 1;
        (server() ? API.call("POST", "/admin/chapters", { classNo: contentSel.cls, name: n, icon: ic, color: col }) : Promise.resolve({ chapterNo: no })).then(function (r) {
          DATA.push({ class: contentSel.cls, chapterNo: r.chapterNo || no, chapter: n, icon: ic, color: col, topics: [] });
          contentSel.ch = chs().length - 1; contentSel.tp = 0; logAct("Added chapter " + n + " (Class " + contentSel.cls + ")"); toast("Chapter added ✓ Now add a topic.");
          refreshLearn(); return loadServer(contentSel.cls, true);
        }).then(function () { draw(); openForm("tp", chs()[contentSel.ch]); }).catch(function (x) { err(x.message); });
      });
      if (kind === "tp") q("#ad-ftp").addEventListener("submit", function (e) {
        e.preventDefault(); var n = q("#ad-tpn").value.trim(), ic = q("#ad-tpi").value.trim() || "📐", sm = q("#ad-tps").value.trim();
        var steps = qa("#ad-steps .ad-step").map(function (r) { return { title: q('[data-st="t"]', r).value.trim(), text: q('[data-st="x"]', r).value.trim(), example: q('[data-st="e"]', r).value.trim() }; }).filter(function (s) { return s.title; });
        if (n.length < 2) return err("Enter a topic name.");
        if (!steps.length) return err("Add at least one lesson step (title + explanation).");
        if (steps.some(function (s) { return !s.text; })) return err("Each step needs an explanation.");
        var sc = server() ? svChapter(contentSel.cls, ch.chapterNo) : null;
        if (server() && !sc) return err("This chapter isn’t on the server yet. Reload the Content tab.");
        var localId = "c" + contentSel.cls + "-ch" + ch.chapterNo + "-t" + (ch.topics.length + 1) + "-" + Date.now().toString(36);
        (sc ? API.call("POST", "/admin/topics", { chapterId: sc._id, name: n, icon: ic, summary: sm, steps: steps }) : Promise.resolve({ slug: localId })).then(function (r) {
          var id = r.slug || localId;
          ch.topics.push({ id: id, name: n, icon: ic, summary: sm || n, steps: steps, quiz: [] });
          if (r._id && API && API.map) API.map[id] = { id: r._id, quizId: r.quizId };
          contentSel.tp = ch.topics.length - 1; logAct("Added topic " + n + " in " + ch.chapter); toast("Topic added ✓ Now add questions.");
          refreshLearn(); return loadServer(contentSel.cls, true);
        }).then(function () { draw(); var c2 = chs()[contentSel.ch]; openForm("q", c2, c2.topics[contentSel.tp]); }).catch(function (x) { err(x.message); });
      });
      if (kind === "q") q("#ad-fq").addEventListener("submit", function (e) {
        e.preventDefault(); var type = q('input[name="ad-qt"]:checked').value, text = q("#ad-qq").value.trim(); if (!text) return err("Write the question.");
        var Q, payload;
        if (type === "mcq") {
          var opts = qa("[data-opt]").map(function (x) { return x.value.trim(); });
          if (opts.some(function (o) { return !o; })) return err("Fill all four options.");
          if (new Set(opts.map(function (o) { return o.toLowerCase(); })).size < 4) return err("Options must be different.");
          var ai = +q("#ad-qa").value, ex = q("#ad-qx").value.trim(), hi = q("#ad-qh").value.trim();
          Q = { type: "mcq", q: text, options: opts, answer: ai, explanation: ex || ("Correct answer: " + opts[ai]), hint: hi };
          payload = { type: "MCQ", text: text, options: opts, correctIndex: ai, explanation: Q.explanation, hint: hi };
        } else {
          var ma = q("#ad-qm").value.trim(), kw = q("#ad-qk").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
          if (!ma) return err("Write the model answer.");
          if (!kw.length) return err("Add at least one keyword for auto-marking.");
          Q = { type: "subjective", q: text, modelAnswer: ma, keywords: kw };
          payload = { type: "SUBJECTIVE", text: text, modelAnswer: ma, keywords: kw };
        }
        var st = server() ? svTopic(contentSel.cls, ch.chapterNo, tp.id) : null;
        if (server() && !st) return err("This topic isn’t on the server yet. Reload the Content tab.");
        (st ? API.call("POST", "/admin/topics/" + st._id + "/questions", payload) : Promise.resolve()).then(function () {
          tp.quiz.push(Q); if (SV.qs[tp.id]) delete SV.qs[tp.id]; if (API && API.quizCache && API.map && API.map[tp.id]) delete API.quizCache[API.map[tp.id].quizId];
          logAct("Added a " + (type === "mcq" ? "MCQ" : "subjective") + " question to " + tp.name); toast("Question added ✓ (" + tp.quiz.length + " in this topic)");
          draw(); openForm("q", ch, tp);
        }).catch(function (x) { err(x.message); });
      });
    }
    loadServer(contentSel.cls).then(draw, function (e) { draw(); toast("Server content not loaded: " + e.message); });
  }

  function aClasses() {
    DS.classes().then(function (list) {
      body().innerHTML = '<div class="x-card"><p class="x-eyebrow">Classes</p><h2 class="x-h2">Which classes are open?</h2><p class="ad-small">Content is ready for Class 9 and 10. Turn on other classes once their content is added.</p>' +
        '<div class="ad-cls">' + list.sort(function (a, b) { return a.no - b.no; }).map(function (c) { return '<label>Class ' + c.no + ' <input type="checkbox" data-cls="' + c.id + '"' + (c.active ? " checked" : "") + " /></label>"; }).join("") + "</div></div>";
      body().onchange = function (e) { var i = e.target.closest("[data-cls]"); if (!i) return; DS.setClass(i.getAttribute("data-cls"), i.checked).then(function () { logAct("Class " + i.parentNode.textContent.trim() + (i.checked ? " opened" : " closed")); toast("Saved ✓"); }).catch(function (x) { i.checked = !i.checked; toast(x.message); }); };
    }).catch(fail);
  }

  function aSettings() {
    DS.xp().then(function (v) {
      var L = { CORRECT_ANSWER: "Correct answer", LESSON_COMPLETE: "Lesson complete", QUIZ_COMPLETE: "Quiz complete", DAILY_CHALLENGE: "Daily challenge", PERFECT_QUIZ: "Perfect quiz bonus" };
      body().innerHTML = '<div class="x-card"><p class="x-eyebrow">Gamification</p><h2 class="x-h2">XP rules</h2><form id="ad-xp" class="ad-tools">' + Object.keys(L).map(function (k) { return "<label>" + L[k] + '<input class="ad-in" type="number" min="0" max="1000" data-xp="' + k + '" value="' + (v[k] != null ? v[k] : 0) + '" /></label>'; }).join("") +
        '<button class="x-btn x-btn--teal x-btn--sm" type="button" data-sub="1">Save</button></form></div>' +
        '<div class="x-card"><p class="x-eyebrow">Account</p><h2 class="x-h2">Your admin login</h2><p>' + esc(session.user.email) + '</p><p class="ad-small">The admin password is set on the server with the <b>ADMIN_PASSWORD</b> environment variable and applied each time the server starts.</p></div>';
      q("#ad-xp").addEventListener("submit", function (e) { e.preventDefault(); var o = {}; qa("[data-xp]").forEach(function (i) { o[i.getAttribute("data-xp")] = Math.max(0, +i.value || 0); }); DS.saveXp(o).then(function () { logAct("XP rules updated"); toast("XP rules saved ✓"); }).catch(function (x) { toast(x.message); }); });
    }).catch(fail);
  }

  adBtn.addEventListener("click", function () { renderAdmin(adTab); });
  setTimeout(function () { q("#ma-le").focus(); }, 50);
})();
