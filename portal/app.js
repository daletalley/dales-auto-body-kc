// Dale's Auto Body — shop portal. Guided workflow: every screen shows the one next thing to do.
(() => {
"use strict";
const SB_URL = "https://uwhtxhxetjbkngjypkcx.supabase.co";
const SB_KEY = "sb_publishable_aGD67KSXQybtbagP_DJfDQ_7TaFb4gI"; // public key; every row is protected by row-level security
const sb = window.supabase.createClient(SB_URL, SB_KEY);
const K = window.KS;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const get = (o, p) => p.split(".").reduce((a, k) => a == null ? a : a[k], o);
const setp = (o, p, v) => { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach(k => { a[k] = a[k] || {}; a = a[k]; }); a[ks.at(-1)] = v; };
const money = n => K.money(n) || "$0.00";
const todayISO = () => K.iso(K.TODAY);
const daysSince = iso => { const d = K.D(iso); return d ? Math.round((K.TODAY - d) / 864e5) : null; };
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ================= validation =================
function parseMoney(v) {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100) / 100;
}
function fmtPhone(v) {
  const d = String(v || "").replace(/\D/g, ""); const t = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  return t.length === 10 ? `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}` : String(v || "").trim();
}
const phoneOk = v => { if (!v) return true; const d = v.replace(/\D/g, ""); return d.length === 10 || (d.length === 11 && d[0] === "1"); };
const emailOk = v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
function vinCheck(raw) {
  const s = String(raw || "").toUpperCase().replace(/[\s-]/g, "");
  if (!s) return { ok: true, value: "" };
  if (!/^[A-Z0-9]+$/.test(s)) return { ok: false, msg: "Letters and numbers only." };
  if (/[IOQ]/.test(s) && s.length === 17) return { ok: false, msg: "VINs never use the letters I, O or Q. Check for a 1, 0 or 9." };
  if (s.length !== 17) return { ok: true, value: s, warn: `That's ${s.length} characters. Cars and trucks from 1981 on have 17. Fine for older cars or equipment serials.` };
  const map = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const wt = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0; for (let i = 0; i < 17; i++) { const ch = s[i]; sum += (/\d/.test(ch) ? +ch : map[ch]) * wt[i]; }
  const cd = sum % 11 === 10 ? "X" : String(sum % 11);
  if (s[8] !== cd) return { ok: true, value: s, warn: "The VIN's check digit doesn't add up, so one character may be off. Compare it to the title or the dash plate." };
  return { ok: true, value: s };
}
function friendly(e) {
  const m = String(e?.message || e || "");
  if (/Failed to fetch|NetworkError|network|load failed/i.test(m)) return "No connection to the internet. Nothing was saved. Check Wi-Fi and try again.";
  if (/JWT|expired|not authenticated|401/i.test(m)) return "Your login expired. Sign in again, then redo that step.";
  if (/row-level security|permission/i.test(m)) return "You don't have permission to change that. Ask Dale.";
  if (/negative/i.test(m)) return "Amounts can't be negative.";
  if (/future/i.test(m)) return "That date is in the future. Use today or an earlier date.";
  return m || "Something went wrong. Try again.";
}

// ================= ui helpers =================
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  car: '<path d="M5 17h14"/><path d="M3 17v-4l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4"/><path d="M3 13h18"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/>',
  money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.3c3 .3 5.5 2.6 5.5 5.7"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M10 13h6M10 17h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  out: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  text: '<path d="M3 19L8.5 5h1L15 19M5.2 14h7.6"/><path d="M15.5 19l3-7.5h.6l3 7.5M16.6 16.8h4.4"/>'
};
const icon = (n, cls = "icon") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ""}</svg>`;
function fillIcons(root) { (root || document).querySelectorAll("[data-icon]").forEach(el => { el.outerHTML = icon(el.dataset.icon); }); }
let toastT;
function toast(text, action, opts = {}) {
  const el = $("toast"); clearTimeout(toastT);
  el.innerHTML = (opts.ok ? `<span class="ok">${icon("check")}</span>` : "") + `<span>${esc(text)}</span>` + (action ? `<button class="linkbtn" type="button" id="toastAct">${esc(action.label)}</button>` : "");
  el.hidden = false;
  if (action) $("toastAct").onclick = () => { el.hidden = true; action.run(); };
  toastT = setTimeout(() => el.hidden = true, action ? 10000 : 6000);
}
async function busy(btn, fn) {
  if (btn && btn.disabled) return;
  const old = btn ? btn.innerHTML : "";
  if (btn) { btn.disabled = true; btn.innerHTML = "Saving…"; }
  try { return await fn(); }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}
const coarse = matchMedia("(pointer: coarse)").matches;
let modalDirty = false, modalOnClose = null, modalOpener = null;
function trapFocus(box, e) {
  if (e.key !== "Tab") return;
  const f = [...box.querySelectorAll('button:not([disabled]),a[href],input:not([type=hidden]):not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null);
  if (!f.length) return; const first = f[0], last = f.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function openModal(html, opts = {}) {
  if ($("overlay").hidden) modalOpener = document.activeElement;
  $("modal").innerHTML = `<button class="iconbtn mclose" type="button" data-act="close" aria-label="Close">${icon("close")}</button><div class="mbody">${html}</div>`;
  const h = $("modal").querySelector("h2"); if (h) { h.id = "mTitle"; $("modal").setAttribute("aria-labelledby", "mTitle"); } else $("modal").removeAttribute("aria-labelledby");
  // pin the button bar to the bottom edge of the sheet; submit buttons stay tied to their form
  const foot = $("modal").querySelector(".mbody .modalfoot");
  if (foot) { const form = foot.closest("form"); if (form) { form.id = form.id || "mform"; foot.querySelectorAll("button[type=submit]").forEach(b => b.setAttribute("form", form.id)); } $("modal").appendChild(foot); }
  $("modal").classList.toggle("hasfoot", !!foot);
  $("overlay").hidden = false; document.body.style.overflow = "hidden"; modalDirty = false; modalOnClose = opts.onClose || null;
  $("modal").querySelector(".mbody").scrollTop = 0;
  const f = $("modal").querySelector("[autofocus]") || (!coarse && $("modal").querySelector(".mbody input:not([type=hidden]):not([type=file]):not([readonly]),.mbody select,.mbody textarea"));
  setTimeout(() => (f || $("modal").querySelector(".mclose")).focus(), 30);
}
async function closeModal(force) {
  if ($("overlay").hidden) return;
  if (!force && modalDirty && !(await confirmBox({ title: "Throw away what you typed?", body: "You have changes that aren't saved yet.", ok: "Throw away", cancel: "Keep editing", danger: true }))) return;
  $("overlay").hidden = true; $("modal").innerHTML = ""; modalDirty = false; document.body.style.overflow = "";
  const cb = modalOnClose; modalOnClose = null; if (cb) cb();
  if (modalOpener && modalOpener.isConnected) { try { modalOpener.focus(); } catch (e) { /* gone */ } } modalOpener = null;
}
$("modal").addEventListener("input", e => { if (!e.target.closest("[data-nodirty]")) modalDirty = true; });
$("modal").addEventListener("keydown", e => trapFocus($("modal"), e));
$("overlay").addEventListener("mousedown", e => { if (e.target.id === "overlay") closeModal(); });
let confirmResolve = null, confirmOpener = null;
function confirmBox({ title, body = "", ok = "OK", cancel = "Cancel", danger = false }) {
  return new Promise(res => {
    confirmResolve = res; confirmOpener = document.activeElement;
    $("confirmBox").innerHTML = `<div class="mbody"><h2 id="cTitle">${esc(title)}</h2>${body ? `<div>${body}</div>` : ""}</div>
      <div class="modalfoot">${cancel ? `<button class="btn ghost" type="button" data-cf="0">${esc(cancel)}</button>` : ""}<button class="btn ${danger ? "danger" : "primary"}" type="button" data-cf="1">${esc(ok)}</button></div>`;
    $("confirmBox").setAttribute("aria-labelledby", "cTitle");
    $("confirmOverlay").hidden = false; setTimeout(() => $("confirmBox").querySelector(danger ? '[data-cf="0"]' : '[data-cf="1"]')?.focus() || $("confirmBox").querySelector('[data-cf="1"]').focus(), 30);
  });
}
function confirmDone(v) { $("confirmOverlay").hidden = true; const r = confirmResolve; confirmResolve = null; if (confirmOpener && confirmOpener.isConnected) { try { confirmOpener.focus(); } catch (e) { /* gone */ } } if (r) r(v); }
$("confirmOverlay").addEventListener("click", e => {
  const b = e.target.closest("[data-cf]"); if (!b && e.target.id !== "confirmOverlay") return;
  confirmDone(b ? b.dataset.cf === "1" : null);
});
$("confirmBox").addEventListener("keydown", e => trapFocus($("confirmBox"), e));
document.addEventListener("keydown", e => {
  if (e.key === "/" && !$("appView").hidden && $("overlay").hidden && !e.target.closest("input,textarea,select")) { e.preventDefault(); openSearch(); return; }
  if (e.key !== "Escape") return;
  if (!$("confirmOverlay").hidden) { confirmDone(null); return; }
  if (!$("overlay").hidden) closeModal();
});
function fieldErr(id, msg) {
  const el = $(id); if (!el) return;
  const f = el.closest(".field"); if (!f) return;
  f.classList.toggle("invalid", !!msg);
  let m = f.querySelector(".fmsg"); if (!m) { m = document.createElement("div"); m.className = "fmsg"; m.id = id + "-err"; m.setAttribute("role", "alert"); f.appendChild(m); }
  m.textContent = msg || "";
  if (msg) { el.setAttribute("aria-invalid", "true"); el.setAttribute("aria-describedby", m.id); } else { el.removeAttribute("aria-invalid"); }
}
function fieldWarn(id, msg) {
  const el = $(id); if (!el) return; const f = el.closest(".field"); if (!f) return;
  let m = f.querySelector(".fwarn"); if (!m) { m = document.createElement("div"); m.className = "fwarn"; f.appendChild(m); }
  m.textContent = msg || "";
}
const val = id => ($(id)?.value ?? "").trim();
function dateRule(id, { required = false, notFuture = true, min = null, minLabel = "" } = {}) {
  const v = val(id);
  if (!v) { if (required) { fieldErr(id, "Pick a date."); return false; } fieldErr(id, ""); return true; }
  if (!K.D(v)) { fieldErr(id, "That isn't a valid date."); return false; }
  if (notFuture && v > todayISO()) { fieldErr(id, "That's in the future. Use today or earlier."); return false; }
  if (min && v < min) { fieldErr(id, `Can't be before ${minLabel || K.fmt(K.D(min))}.`); return false; }
  fieldErr(id, ""); return true;
}

// ================= state =================
const S = { user: null, account: null, isOwner: false, isDale: false, customers: [], jobs: [], liens: [], payments: [], members: [], invites: [], photos: [], links: [], offlineSince: null };
const STAGES = [
  { k: "estimate", label: "Estimate" }, { k: "in_progress", label: "In shop" }, { k: "done", label: "Work done" },
  { k: "invoiced", label: "Bill given" }, { k: "paid", label: "Paid" }];
const STAGE_LABEL = Object.fromEntries(STAGES.map(s => [s.k, s.label]));
const METHODS = { cash: "Cash", card: "Card", check: "Check", insurance: "Insurance", other: "Other" };
const balance = j => Math.max(0, Math.round(((+j.amount || 0) - (+j.amount_paid || 0)) * 100) / 100);
const ageDays = j => daysSince(j.invoiced_on || j.completed_on);
const owes = j => j.status === "invoiced" && (+j.amount || 0) > 0 && balance(j) > 0; // only billed work counts as owed
const unbilled = j => j.status === "done" && !j._pending;
const cust = id => S.customers.find(c => c.id === id);
const jobById = id => S.jobs.find(j => j.id === id);
const jobPays = j => S.payments.filter(p => p.job_id === j.id).sort((a, b) => (b.paid_on || "").localeCompare(a.paid_on || "") || (b.created_at || "").localeCompare(a.created_at || ""));
const openLien = jobId => S.liens.find(l => l.job_id === jobId && l.status === "open");
function vehicleText(j) {
  if (j.kind === "property") return j.property?.address || "Building job";
  const v = j.vehicle || {}; return [v.year, v.make, v.model].filter(Boolean).join(" ") || (j.kind === "equipment" ? "Equipment" : "Vehicle");
}
const jobName = j => `${cust(j.customer_id)?.name || "No customer"} · ${vehicleText(j)}`;
function stageChip(j) {
  if (j.status === "paid") return `<span class="chip paid">Paid</span>`;
  if (j.status === "done") return `<span class="chip soon">Needs a bill</span>`;
  if (owes(j)) { const a = ageDays(j) ?? 0; return `<span class="chip ${a >= 30 ? "over" : "up"}">${a >= 30 ? `${plural(a, "day")} unpaid` : a === 0 ? "Billed today" : plural(a, "day")}</span>`; }
  return `<span class="chip up">${esc(STAGE_LABEL[j.status])}</span>`;
}

// ================= auth =================
let authMode = "signin", recovering = false, userSignedOut = false;
const wantsSetup = new URLSearchParams(location.search).get("setup") === "1";
function setAuthMode(m) {
  authMode = m;
  $("authTitle").textContent = m === "signin" ? "Sign in" : m === "signup" ? "Create your login" : "Set a new password";
  $("authSubmit").textContent = m === "signin" ? "Sign in" : m === "signup" ? "Create login" : "Save new password";
  $("authSwitchText").textContent = m === "signin" ? "First time here?" : "Already have a login?";
  $("authSwitch").textContent = m === "signin" ? "Create your login" : "Sign in";
  $("authPass").autocomplete = m === "signin" ? "current-password" : "new-password";
  $("authEmail").closest(".field").hidden = m === "reset";
  $("authSwitchRow").hidden = m === "reset";
  $("authMsg").textContent = ""; $("authMsg").className = "msg";
}
function showOnly(id) { ["authView", "setupView", "appView", "noShopView", "loadView"].forEach(v => $(v).hidden = v !== id); }
$("authSwitch").addEventListener("click", e => { e.preventDefault(); setAuthMode(authMode === "signin" ? "signup" : "signin"); });
$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = val("authEmail").toLowerCase(), password = $("authPass").value, msg = $("authMsg");
  const err = t => { msg.className = "msg err"; msg.textContent = t; };
  if (authMode !== "reset" && !emailOk(email)) return err("Enter a real email address.");
  if (!email && authMode !== "reset") return err("Enter your email.");
  if (password.length < 8) return err("Passwords need at least 8 characters.");
  await busy($("authSubmit"), async () => {
    msg.className = "msg"; msg.textContent = "";
    try {
      if (authMode === "reset") {
        const { error } = await sb.auth.updateUser({ password }); if (error) throw error;
        recovering = false; history.replaceState(null, "", location.pathname); toast("Password saved.");
        const { data } = await sb.auth.getSession(); bootedFor = undefined; boot(data.session); return;
      }
      if (authMode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error;
      } else {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) { setAuthMode("signin"); return err("That email already has a login. Sign in, or tap Forgot password."); }
        if (!data.session) { setAuthMode("signin"); msg.textContent = "Check your email for a link to confirm, then sign in here."; }
      }
    } catch (ex) { err(/invalid login/i.test(ex.message || "") ? "Wrong email or password. Tap Forgot password to reset it." : friendly(ex)); }
  });
});
$("authForgot").addEventListener("click", async e => {
  e.preventDefault();
  const email = val("authEmail").toLowerCase(), msg = $("authMsg");
  if (!emailOk(email) || !email) { msg.className = "msg err"; msg.textContent = "Type your email above first, then tap Forgot password."; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  msg.className = error ? "msg err" : "msg";
  msg.textContent = error ? friendly(error) : "If that email has a login, a reset link is on its way. Open it on this device.";
});
$("setupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const row = { owner_id: S.user.id, name: val("sName"), address: val("sAddr"), phone: fmtPhone(val("sPhone")), industry: $("sInd").value };
  if (!row.name || !row.address) { $("setupMsg").className = "msg err"; $("setupMsg").textContent = "Business name and address are required."; return; }
  await busy(e.submitter, async () => {
    const { data, error } = await sb.from("shop_accounts").insert(row).select().single();
    if (error) { $("setupMsg").className = "msg err"; $("setupMsg").textContent = friendly(error); return; }
    history.replaceState(null, "", location.pathname); S.account = data; await startApp();
  });
});
$("noShopRetry").addEventListener("click", () => { bootedFor = undefined; sb.auth.getSession().then(({ data }) => boot(data.session)); });
$("noShopOut").addEventListener("click", () => { userSignedOut = true; sb.auth.signOut(); });
$("loadRetry").addEventListener("click", () => { bootedFor = undefined; sb.auth.getSession().then(({ data }) => boot(data.session)); });

let bootedFor;
async function boot(session) {
  const uid = session?.user?.id || null;
  if (uid === bootedFor) return;
  const wasSignedIn = !!bootedFor; bootedFor = uid;
  if (!session) {
    S.user = null; S.account = null; showOnly("authView"); setAuthMode(wantsSetup ? "signup" : "signin");
    if (wasSignedIn && !userSignedOut) { $("authMsg").className = "msg err"; $("authMsg").textContent = "You were signed out. Sign in again to keep going."; }
    userSignedOut = false; return;
  }
  S.user = session.user;
  showOnly("loadView"); $("loadMsg").textContent = ""; $("loadRetry").hidden = true;
  const snap = loadSnapshot(S.user.id);
  if (!navigator.onLine && snap) return startOffline(snap);
  try {
    await sb.rpc("shop_claim_invites");
    const { data, error } = await sb.from("shop_accounts").select("*").order("created_at");
    if (error) throw error;
    const mine = (data || []).find(a => a.owner_id === S.user.id) || (data || [])[0];
    if (!mine) {
      if (wantsSetup) { showOnly("setupView"); return; }
      $("noShopEmail").textContent = S.user.email; showOnly("noShopView"); return;
    }
    S.account = mine; await startApp();
  } catch (ex) {
    if (snap && isNetErr(ex)) return startOffline(snap);
    $("loadMsg").className = "msg err"; $("loadMsg").textContent = friendly(ex); $("loadRetry").hidden = false;
  }
}
async function startApp() {
  S.isDale = S.account.owner_id === S.user.id;
  S.isOwner = S.isDale;
  await loadAll();
  S.isOwner = S.isDale || S.members.some(m => m.user_id === S.user.id && m.active && m.co_owner);
  if (S.isOwner && !S.isDale) await loadAll();
  showOnly("appView"); shellReady(); route(); flushQueue();
}
async function startOffline(snap) {
  Object.assign(S, { account: snap.account, isDale: snap.isDale, isOwner: snap.isOwner, customers: snap.customers, jobs: snap.jobs, liens: snap.liens, payments: snap.payments, members: snap.members, invites: snap.invites, photos: snap.photos || [], links: snap.links || [] });
  S.offlineSince = snap.at; await mergePending();
  showOnly("appView"); shellReady(); netState(); route();
}
function shellReady() {
  fillIcons(document.querySelector(".shell")); fillIcons(document.querySelector(".tabbar"));
  $("sideWho").innerHTML = `<span>${esc(S.user?.email || "")}</span><button class="linkbtn" type="button" data-act="sign-out" style="justify-content:flex-start;padding:0">Sign out</button>`;
}
async function loadAll() {
  const a = S.account.id;
  const q = (t, order) => sb.from(t).select("*").eq("account_id", a).order(order[0], { ascending: order[1] });
  const res = await Promise.all([
    q("shop_customers", ["name", true]), q("shop_jobs", ["created_at", false]), q("shop_liens", ["created_at", false]),
    q("shop_payments", ["created_at", false]), q("shop_members", ["created_at", true]),
    S.isOwner ? q("shop_invites", ["created_at", true]) : Promise.resolve({ data: [] }),
    q("shop_job_photos", ["created_at", true]),
    q("shop_job_links", ["created_at", false]),
    sb.from("shop_accounts").select("*").eq("id", a).maybeSingle()
  ]);
  const bad = res.find(r => r.error); if (bad) throw bad.error;
  [S.customers, S.jobs, S.liens, S.payments, S.members, S.invites, S.photos, S.links] = res.slice(0, 8).map(r => r.data || []);
  if (res[8].data) S.account = res[8].data;
  S.offlineSince = null; saveSnapshot(); await mergePending();
}
async function reload() { try { await loadAll(); } catch (ex) { if (isNetErr(ex)) { await mergePending(); netState(); } else toast(friendly(ex)); } }

// ================= offline: snapshot + upload queue =================
const SNAP_KEY = "dab.snapshot.v1";
const isNetErr = e => /Failed to fetch|NetworkError|network|load failed|fetch/i.test(String(e?.message || e || "")) || !navigator.onLine;
function saveSnapshot() {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify({ at: Date.now(), uid: S.user.id, account: S.account, isDale: S.isDale, isOwner: S.isOwner, customers: S.customers, jobs: S.jobs.filter(j => !j._pending).map(j => j._orig ? { ...j, ...j._orig, _orig: undefined } : j), liens: S.liens, payments: S.payments, members: S.members, invites: S.invites, photos: S.photos.filter(p => !p._pending), links: S.links })); } catch (e) { /* storage full or blocked: offline view just won't have data */ }
}
function loadSnapshot(uid) { try { const s = JSON.parse(localStorage.getItem(SNAP_KEY) || "null"); return s && s.uid === uid ? s : null; } catch { return null; } }
const IDB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("dab-portal", 1); r.onupgradeneeded = () => r.result.createObjectStore("queue", { keyPath: "qid" }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction("queue", mode); const req = fn(t.objectStore("queue")); t.oncomplete = () => res(req ? req.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("Couldn't save on this device. Storage may be full.")); }); };
  return { all: () => run("readonly", st => st.getAll()), put: it => run("readwrite", st => st.put(it)), del: k => run("readwrite", st => st.delete(k)) };
})();
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
let queueCache = [];
async function mergePending() {
  try { queueCache = (await IDB.all()).filter(i => S.account && i.accountId === S.account.id); } catch { queueCache = []; }
  S.jobs = S.jobs.filter(j => !j._pending); S.customers = S.customers.filter(c => !c._pending); S.photos = (S.photos || []).filter(p => !p._pending);
  for (const it of queueCache) {
    if (it.type === "job") {
      if (it.customer && !S.customers.some(c => c.id === it.customer.id)) S.customers.push({ ...it.customer, _pending: true });
      if (!S.jobs.some(j => j.id === it.job.id)) S.jobs.unshift({ ...it.job, amount_paid: 0, created_at: new Date(it.created).toISOString(), _pending: true, _error: it.error || "" });
      (it.photos || []).forEach(p => S.photos.push({ id: p.pid, job_id: it.job.id, kind: p.kind, _pending: true, _blob: p.blob }));
    }
    if (it.type === "photo") S.photos.push({ id: it.pid, job_id: it.jobId, kind: it.kind, _pending: true, _blob: it.blob });
  }
  // queued stage changes and payments: show them as if they'd already happened (reversibly)
  S.jobs.forEach(jj => { if (jj._orig) { Object.assign(jj, jj._orig); delete jj._orig; } });
  S.payments = S.payments.filter(p => !p._pending);
  const keep = (jj, keys) => { jj._orig = jj._orig || {}; keys.forEach(k => { if (!(k in jj._orig)) jj._orig[k] = jj[k] ?? null; }); };
  for (const it of queueCache) {
    const jj = S.jobs.find(x => x.id === (it.jobId || it.row?.job_id));
    if (it.type === "update" && jj) { keep(jj, Object.keys(it.row)); Object.assign(jj, it.row); }
    if (it.type === "pay") {
      S.payments.unshift({ ...it.row, created_at: new Date(it.created).toISOString(), _pending: true });
      if (jj) { keep(jj, ["amount_paid", "status", "paid_on"]); jj.amount_paid = Math.round(((+jj.amount_paid || 0) + (+it.row.amount || 0)) * 100) / 100;
        if (+jj.amount > 0 && jj.amount_paid >= +jj.amount) { jj.status = "paid"; jj.paid_on = jj.paid_on || it.row.paid_on || todayISO(); } }
    }
  }
  S.customers.sort((a, b) => a.name.localeCompare(b.name));
  pendingBar();
}
function pendingBar() {
  const bar = $("pendbar"); if (!bar) return;
  const n = queueCache.length, bad = queueCache.filter(i => i.error);
  if (!n) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.className = "pendbar" + (bad.length ? " bad" : "");
  bar.innerHTML = bad.length
    ? `${plural(bad.length, "saved item")} couldn't upload: ${esc(bad[0].error)} <button class="linkbtn" type="button" data-act="retry-queue">Try again</button> <button class="linkbtn danger" type="button" data-act="discard-queue">Throw away</button>`
    : (() => { const jobs = new Set(queueCache.map(i => i.jobId || i.job?.id || i.row?.job_id)).size; if (queueCache.some(i => i.held)) return `Changes to ${plural(jobs, "job")} saved on this device. Some are waiting on another change to the same job.`; return `Changes to ${plural(jobs, "job")} saved on this device. ${navigator.onLine ? "Uploading…" : "They upload by themselves when the internet is back."}`; })();
}
let flushing = false;
async function flushQueue() {
  if (flushing || !navigator.onLine || !S.account) return;
  flushing = true; let did = 0;
  try {
    const items = (await IDB.all()).filter(i => i.accountId === S.account.id).sort((a, b) => a.created - b.created);
    const jobOf = i => i.jobId || i.job?.id || i.row?.job_id; const held = new Set();
    for (const it of items) {
      if (it.type !== "pay" && held.has(jobOf(it))) { if (!it.held) { it.held = true; await IDB.put(it); } continue; }
      if (it.held) { delete it.held; await IDB.put(it); }
      if (it.error) { held.add(jobOf(it)); continue; }
      try {
        if (it.type === "job") {
          if (it.customer) { const { error } = await sb.from("shop_customers").upsert(it.customer, { onConflict: "id", ignoreDuplicates: true }); if (error) throw error; }
          const { error } = await sb.from("shop_jobs").upsert(it.job, { onConflict: "id", ignoreDuplicates: true }); if (error) throw error;
          for (const p of it.photos || []) await uploadPhoto(it.job.id, p.blob, p.kind, p.pid);
        } else if (it.type === "photo") await uploadPhoto(it.jobId, it.blob, it.kind, it.pid);
        else if (it.type === "update") {
          let q = sb.from("shop_jobs").update(it.row).eq("id", it.jobId); if (it.fromStatus) q = q.eq("status", it.fromStatus);
          const { data, error } = await q.select("id"); if (error) throw error;
          if (it.fromStatus && Array.isArray(data) && !data.length) throw new Error("Someone else changed this job while you were offline, so this change wasn't applied. Open the job to check it.");
        }
        else if (it.type === "pay") { const { error } = await sb.from("shop_payments").upsert(it.row, { onConflict: "id", ignoreDuplicates: true }); if (error) throw error; }
        await IDB.del(it.qid); did++;
      } catch (ex) {
        if (isNetErr(ex)) break; // try again when back online
        it.error = friendly(ex); await IDB.put(it); held.add(jobOf(it)); // real problem: show it, don't loop
      }
    }
  } catch (ex) { /* device storage unavailable */ }
  finally { flushing = false; }
  if (did) { await reload(); route(true); toast(did === 1 ? "Uploaded." : `${did} saved items uploaded.`); }
  else { await mergePending(); }
}
async function uploadPhoto(jobId, blob, kind, pid) {
  const ext = /png/.test(blob.type) ? "png" : /webp/.test(blob.type) ? "webp" : /hei/.test(blob.type) ? "heic" : "jpg";
  const path = `${S.account.id}/${jobId}/${pid}.${ext}`;
  const up = await sb.storage.from("shop-photos").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (up.error && !/exist|duplicate|409/i.test(up.error.message || String(up.error.statusCode))) throw up.error;
  const { error } = await sb.from("shop_job_photos").upsert({ id: pid, account_id: S.account.id, job_id: jobId, path, kind }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
}
async function enqueue(item) {
  item.qid = item.qid || uuid(); item.created = Date.now(); item.accountId = S.account.id;
  await IDB.put(item); await mergePending();
}
async function shrinkImage(file) {
  const okType = /^image\//.test(file.type || "") || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name || "");
  if (!okType) throw new Error("That file isn't a photo. Pick a picture of the estimate.");
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const sc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82));
    if (out && out.size > 0) return out;
  } catch (e) { /* browser can't read this format (e.g. HEIC on Windows): upload the original */ }
  if (file.size > 15 * 1024 * 1024) throw new Error("That photo is too big (over 15 MB). Take it again or pick a smaller one.");
  return file;
}
const signed = {};
async function photoSrc(p) {
  if (p._blob) return URL.createObjectURL(p._blob);
  if (signed[p.path] && signed[p.path].exp > Date.now()) return signed[p.path].url;
  if (!navigator.onLine) return "";
  const { data, error } = await sb.storage.from("shop-photos").createSignedUrl(p.path, 3600);
  if (error || !data) return "";
  signed[p.path] = { url: data.signedUrl, exp: Date.now() + 55 * 60e3 };
  return data.signedUrl;
}
async function fillPhotos(root) {
  const imgs = [...(root || document).querySelectorAll("img[data-photo]")];
  await Promise.all(imgs.map(async img => { const p = S.photos.find(x => x.id === img.dataset.photo); if (!p) return; const src = await photoSrc(p); if (src) img.src = src; else img.alt = "Photo will show when you're online"; }));
}
const jobPhotos = j => (S.photos || []).filter(p => p.job_id === j.id).sort((a, b) => (a.kind === "estimate" ? 0 : 1) - (b.kind === "estimate" ? 0 : 1));
function netState() {
  const off = !navigator.onLine;
  $("netbar").hidden = !off;
  $("netbar").textContent = off ? `You're offline${S.offlineSince ? `. Showing what was saved ${new Date(S.offlineSince).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}. You can still add jobs, photos and payments and move jobs along. It all uploads when you're back online.` : "";
  pendingBar();
}

// keep fresh when coming back to the tab (someone else may have changed something)
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible") return;
  if (dayChanged()) return;
  if (!S.account || $("appView").hidden) return;
  if (!$("overlay").hidden || document.activeElement?.matches("input,textarea,select")) return;
  await reload(); route(true);
});
let curDay = new Date().toDateString();
function dayChanged() {
  if (new Date().toDateString() === curDay) return false;
  const oldISO = todayISO(); curDay = new Date().toDateString(); K.refreshToday(); const nowISO = todayISO();
  document.querySelectorAll('#modal input[type=date]').forEach(i => { if (i.max === oldISO) i.max = nowISO; if (i.value === oldISO && !modalDirty) i.value = nowISO; });
  if (modalDirty && document.querySelector("#modal input[type=date]")) toast("It's past midnight. Check the date before you save.");
  if (!$("appView").hidden && $("overlay").hidden) route(true);
  return false;
}
setInterval(dayChanged, 60000);
window.addEventListener("offline", () => netState());
window.addEventListener("online", async () => { netState(); if (!S.account) return; toast("Back online. Updating…"); await flushQueue(); await reload(); netState(); route(true); });
setInterval(() => { if (navigator.onLine && queueCache.length && !flushing) flushQueue(); }, 30000);
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
let deferredInstall = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; const b = document.getElementById("installBtn"); if (b) b.hidden = false; });

// ================= routing =================
const LEGAL = `<p class="legal">Private shop portal for Dale's Auto Body. Lien letters are drafts for Dale to review and sign. This is not legal advice. Kansas deadlines summarized November 2026 from K.S.A. 58-201 et seq., 8-1101 et seq., 60-1101 et seq. and Division of Vehicles forms.</p>`;
const backLink = (href, label) => `<a class="back" href="#${href}">${icon("back")}${esc(label)}</a>`;
window.addEventListener("hashchange", () => route(false, true));
function route(keepScroll, fromNav) {
  if ($("appView").hidden) return;
  if (/type=recovery|access_token/.test(location.hash)) return;
  const [view, id] = (location.hash.slice(1) || "home").split("/");
  const navKey = { job: "jobs", customer: "customers", lien: "liens" }[view] || view;
  const inMore = ["liens", "settings", "help"].includes(navKey);
  document.querySelectorAll("[data-nav]").forEach(a => { if (a.dataset.nav === navKey || (a.dataset.nav === "more" && inMore)) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const views = { home: renderHome, jobs: renderJobs, job: () => renderJob(id), money: renderMoney, customers: renderCustomers, customer: () => renderCustomer(id), liens: renderLiens, lien: () => renderLien(id), settings: renderSettings, help: renderHelp };
  if (view !== "lien") currentLien = null;
  (views[view] || renderHome)();
  const titles = { home: "Today", jobs: "Jobs", job: "Job", money: "Money owed", customers: "Customers", customer: "Customer", liens: "Liens", lien: "Lien case", settings: "Settings", help: "Help" };
  document.title = `${titles[view] || "Today"} · Dale's Shop`;
  if (!keepScroll) { window.scrollTo(0, 0); if (fromNav) $("main").focus({ preventScroll: true }); }
}
const go = h => { if (location.hash === "#" + h) route(); else location.hash = h; };

// ================= search (one search for everything) =================
let searchHits = [], searchOn = 0;
function searchResults(q) {
  q = q.trim().toLowerCase();
  if (q.length < 2) {
    const recent = S.jobs.filter(j => j.status !== "paid").slice(0, 6);
    return { title: recent.length ? "Open jobs" : "", hits: recent.map(j => ({ kind: "Job", label: jobName(j), sub: [STAGE_LABEL[j.status], j.title].filter(Boolean).join(" · "), href: "job/" + j.id })) };
  }
  const digits = q.replace(/\D/g, ""); const hits = [];
  S.customers.forEach(c => {
    if (c.name.toLowerCase().includes(q) || (digits.length >= 3 && (c.phone || "").replace(/\D/g, "").includes(digits)) || (c.email || "").toLowerCase().includes(q))
      hits.push({ kind: "Customer", label: c.name, sub: c.phone || c.email || "", href: "customer/" + c.id });
  });
  S.jobs.forEach(j => {
    const v = j.vehicle || {}; const hay = [v.vin, v.plate, v.make, v.model, v.year, j.title, j.property?.address, j.insurance?.claim, j.insurance?.insurer].filter(Boolean).join(" ").toLowerCase();
    if (hay.includes(q)) hits.push({ kind: "Job", label: jobName(j), sub: [STAGE_LABEL[j.status], j.title, v.vin, v.plate].filter(Boolean).join(" · "), href: "job/" + j.id });
  });
  return { title: "", hits: hits.slice(0, 10) };
}
function openSearch() {
  openModal(`<h2>Find anything</h2>
    <div class="field"><label class="sr" for="sq">Search customers and jobs</label><input id="sq" type="search" enterkeyhint="go" placeholder="Name, phone, car, VIN or plate" autocomplete="off" autofocus data-nodirty role="combobox" aria-expanded="true" aria-controls="sqList" aria-autocomplete="list"></div>
    <div id="sqList" class="srows" role="listbox" aria-label="Results"></div>`);
  const draw = () => {
    const q = val("sq"); const r = searchResults(q); searchHits = r.hits; searchOn = 0;
    $("sqList").innerHTML = (r.title ? `<div class="srtitle" role="presentation">${esc(r.title)}</div>` : "") + (searchHits.length
      ? searchHits.map((h, i) => `<a href="#${h.href}" class="srow ${i === 0 && q ? "on" : ""}" role="option" id="sqo${i}" aria-selected="${i === 0 && !!q}" data-act="close"><span class="k">${h.kind}</span><span style="min-width:0"><span style="display:block;font-weight:600">${esc(h.label)}</span>${h.sub ? `<span class="s">${esc(h.sub)}</span>` : ""}</span></a>`).join("")
      : q.trim().length >= 2 ? `<div class="empty">Nothing matches “${esc(q)}”. Try part of a name, the last 4 of a phone number, or the VIN.</div>` : `<div class="hint">Type a name, phone number, car, VIN or plate.</div>`);
    $("sq").setAttribute("aria-activedescendant", searchHits.length && q ? "sqo0" : "");
  };
  $("sq").addEventListener("input", draw);
  $("sq").addEventListener("keydown", e => {
    if (e.key === "Enter" && searchHits[searchOn]) { e.preventDefault(); const h = searchHits[searchOn].href; closeModal(true).then(() => go(h)); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (!searchHits.length) return;
      searchOn = (searchOn + (e.key === "ArrowDown" ? 1 : -1) + searchHits.length) % searchHits.length;
      $("sqList").querySelectorAll(".srow").forEach((a, i) => { a.classList.toggle("on", i === searchOn); a.setAttribute("aria-selected", i === searchOn); });
      $("sq").setAttribute("aria-activedescendant", "sqo" + searchOn);
    }
  });
  draw();
}
function moreMenu() {
  const big = document.documentElement.classList.contains("big");
  openModal(`<h2>More</h2><div class="morelist">
    <a href="#liens" data-act="close">${icon("doc")}Liens</a>
    <a href="#settings" data-act="close">${icon("gear")}Settings</a>
    <a href="#help" data-act="close">${icon("help")}Help</a>
    <button type="button" data-act="big-text">${icon("text")}<span>${big ? "Normal size text" : "Bigger text"}</span></button>
  </div><div class="hint">Signed in as ${esc(S.user?.email || "")}</div>`);
}

// ================= HOME: to-do list =================
const dollars = n => "$" + Math.round(+n || 0).toLocaleString("en-US");
function buildTasks() {
  const T = [];
  S.liens.filter(l => l.status === "open").forEach(l => {
    const c = lienData(l); const n = guidedNext(c); if (!n) return;
    const st = n.date ? K.status(c, n) : null; const days = n.date ? K.daysFrom(n.date) : null;
    T.push({ rank: days == null ? 50 : days < 0 ? 0 : days <= 7 ? 5 : 40, cls: days != null && days < 0 ? "urgent" : days != null && days <= 7 ? "soon" : "",
      t: `Lien: ${n.title}`, s: `${lienLabel(l)}${n.date ? ` · due ${K.fmt(n.date)}` : ""}`, chip: st,
      acts: [{ label: "Open lien case", primary: true, href: "lien/" + l.id }] });
  });
  S.jobs.forEach(j => {
    if (j._pending) return;
    const c = cust(j.customer_id); const who = c?.name || "No customer";
    if (owes(j)) {
      const a = ageDays(j) ?? 0, lien = openLien(j.id), rem = daysSince(j.last_reminded_on);
      const remTxt = rem != null ? ` · last reminder ${rem === 0 ? "today" : plural(rem, "day") + " ago"}` : " · no reminder sent yet";
      if (a >= 30 && !lien) T.push({ rank: 10, cls: "urgent", t: `${who} owes ${money(balance(j)).replace(/\s/g, "\u00a0")}`, s: `${vehicleText(j)} · ${plural(a, "day")} since the bill${remTxt}`,
        acts: [{ label: "Send reminder", act: "remind", id: j.id, primary: rem == null || rem >= 7 }, { label: "Start lien", act: "start-lien", id: j.id, primary: rem != null && rem < 7 }] });
      else if (a >= 14 && !lien && (rem == null || rem >= 7)) T.push({ rank: 20, cls: "soon", t: `Remind ${who} about ${money(balance(j))}`, s: `${vehicleText(j)} · ${plural(a, "day")} unpaid${remTxt}`,
        acts: [{ label: "Send reminder", act: "remind", id: j.id, primary: true }, { label: "Got paid", act: "pay", id: j.id }] });
    }
    if (j.status === "estimate" && j.approved_at) T.push({ rank: 8, cls: "easy", t: `${who} approved the estimate`, s: `${vehicleText(j)}${+j.amount ? " · " + money(j.amount) : ""} · approved ${K.fmt(new Date(j.approved_at))}. Call them to bring it in.`,
      acts: [{ label: "Car is here", act: "stage-start", id: j.id, primary: true }, ...(c?.phone ? [{ label: "Call", tel: c.phone }] : [])] });
    if (j.status === "done") T.push({ rank: 15, cls: "easy", t: `Give ${who} the bill`, s: `${vehicleText(j)} · work done ${j.completed_on ? K.fmt(K.D(j.completed_on)) : ""}${+j.amount ? ` · ${money(j.amount)}` : " · no price entered yet"}`,
      acts: [{ label: "Bill given", act: "stage-invoice", id: j.id, primary: true }, { label: "Open job", href: "job/" + j.id }] });
    const age = daysSince(j.created_at?.slice(0, 10)) ?? 0;
    if (j.status === "estimate" && !j.approved_at && age >= 14) T.push({ rank: 60, cls: "", t: `Follow up on ${who}'s estimate`, s: `${vehicleText(j)} · estimate is ${plural(age, "day")} old`,
      acts: [{ label: "Open job", href: "job/" + j.id, primary: true }] });
  });
  return T.sort((a, b) => a.rank - b.rank);
}
function taskHtml(t, first) {
  const btn = a => { const cls = `btn ${a.primary ? "outline" : ""}`;
    return a.href ? `<a class="${cls}" href="#${a.href}">${esc(a.label)}</a>` : a.tel ? `<a class="${cls}" href="tel:${esc(a.tel.replace(/[^\d+]/g, ""))}">${icon("phone")}${esc(a.label)}</a>` : `<button class="${cls}" type="button" data-act="${a.act}" data-id="${a.id}">${esc(a.label)}</button>`; };
  return `<div class="task ${t.cls}"><div><div class="t">${esc(t.t)}</div><div class="s">${esc(t.s)}${t.chip ? ` <span class="chip ${t.chip.cls}">${esc(t.chip.txt)}</span>` : ""}</div></div>
    <div class="acts">${t.acts.map(btn).join("")}</div></div>`;
}
let tipOff = false; try { tipOff = !!localStorage.getItem("dab.tipoff"); } catch (e) { /* private mode */ }
function renderHome() {
  const T = buildTasks();
  const inShop = S.jobs.filter(j => j.status === "in_progress").length;
  const owed = S.jobs.filter(owes); const owedTotal = owed.reduce((a, j) => a + balance(j), 0);
  const unb = S.jobs.filter(unbilled); const unbTotal = unb.reduce((a, j) => a + (+j.amount || 0), 0);
  const old = owed.filter(j => (ageDays(j) ?? 0) > 90);
  const hour = new Date().getHours();
  const big = document.documentElement.classList.contains("big");
  const summary = [T.length ? plural(T.length, "thing") + (T.length === 1 ? " needs" : " need") + " you" : "Nothing needs you", plural(inShop, "car") + " in the shop", owedTotal ? dollars(owedTotal) + " owed" : ""].filter(Boolean).join(" · ");
  $("main").innerHTML = `
    <div class="pagehead"><div><div class="eyebrow">${esc(K.longFmt ? K.longFmt(K.TODAY) : K.fmt(K.TODAY))}</div><h1>Good ${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}${S.isDale ? ", Dale" : ""}</h1><p class="lede">${esc(summary)}.</p></div></div>
    <div class="today">
      <div style="display:grid;gap:28px;min-width:0">
        <div class="quick">
          <button class="btn primary big" type="button" data-act="new-job">+ Add a job</button>
          <button class="btn big" type="button" data-act="pay-pick">${icon("money")}Got paid</button>
          <button class="btn big" type="button" data-act="search">${icon("search")}Find</button>
        </div>
        <section aria-labelledby="todoH"><h2 id="todoH">${T.length ? `To do · ${T.length}` : "To do"}</h2>
          <div class="todo">${T.length ? T.map((t, i) => taskHtml(t, i === 0)).join("") : `<div class="allclear"><span class="okbig">${icon("check")}</span>You're all caught up. Nothing needs you right now.</div>`}</div></section>
      </div>
      <aside class="aside" aria-label="Shop at a glance" style="display:grid;gap:16px;align-content:start">
        <h2 style="margin:0">At a glance</h2>
        <div class="tiles">
          <a class="tile" href="#jobs"><div class="n">${inShop}</div><div class="l">${inShop === 1 ? "Car" : "Cars"} in the shop</div></a>
          <a class="tile" href="#money"><div class="n">${dollars(owedTotal)}</div><div class="l">Owed to you</div></a>
          <a class="tile" href="#money"><div class="n">${unb.length}</div><div class="l">Not billed yet</div></a>
          <a class="tile ${old.length ? "alert" : ""}" href="#money"><div class="n">${old.length}</div><div class="l">Over 3 months</div></a>
        </div>
        ${!big && !tipOff ? `<div class="box tip"><h3>Hard to read?</h3><div class="hint">Make every word and button bigger on this device.</div><div class="secondary"><button class="btn" type="button" data-act="big-text">Bigger text</button><button class="btn ghost" type="button" data-act="tip-off">No thanks</button></div></div>` : ""}
      </aside>
    </div>`;
}

// ================= JOBS =================
const JOB_GROUPS = [
  { key: "estimate", title: "Estimates", hint: "Waiting on a yes.", f: j => j.status === "estimate" },
  { key: "in_progress", title: "In shop", hint: "Being worked on now.", f: j => j.status === "in_progress" },
  { key: "done", title: "Work done", hint: "Ready. Give them the bill.", f: j => j.status === "done" },
  { key: "invoiced", title: "Bill given", hint: "Waiting on their money.", f: j => j.status === "invoiced" }
];
const CARD_ACTION = {
  estimate: { label: "Car is here", act: "stage-start" },
  in_progress: { label: "Work is done", act: "stage-done" },
  done: { label: "Bill given", act: "stage-invoice" },
  invoiced: { label: "Got paid", act: "pay" }
};
function jobCard(j, byCar) {
  const c = cust(j.customer_id); const ph = jobPhotos(j)[0]; const a = CARD_ACTION[j.status];
  const work = j.title && j.title !== "Estimate" ? j.title : "";
  const amt = +j.amount ? `<span class="num">${j.status === "invoiced" ? money(balance(j)) + " owed" : money(j.amount)}</span>` : "";
  return `<div class="jcard" data-href="job/${j.id}">
    <div class="jthumb">${ph ? `<img data-photo="${ph.id}" alt="">` : icon("car")}</div>
    <div class="jmain"><a class="jname" href="#job/${j.id}">${esc(byCar ? vehicleText(j) : c?.name || "No customer")}</a><div class="jcar">${esc(byCar ? work || STAGE_LABEL[j.status] : vehicleText(j))}</div>${!byCar && work ? `<div class="jwork">${esc(work)}</div>` : ""}
      <div class="jmeta">${j._pending ? `<span class="chip ${j._error ? "over" : "soon"}">${j._error ? "Couldn't upload" : "Waiting to upload"}</span>` : j.status === "estimate" && j.approved_at ? `<span class="chip done">Approved</span>` : j.status === "invoiced" || j.status === "paid" ? stageChip(j) : ""}${amt}</div></div>
    ${a && !j._pending ? `<button class="btn outline jgo" type="button" data-act="${a.act}" data-id="${j.id}">${a.label}</button>` : ""}
  </div>`;
}
function jobRows(list, empty, byCar) {
  if (!list.length) return empty ? `<div class="empty">${empty}</div>` : "";
  return `<div class="jlist">${list.map(j => jobCard(j, byCar)).join("")}</div>`;
}
function renderJobs() {
  const paid = S.jobs.filter(j => j.status === "paid");
  const active = S.jobs.filter(j => j.status !== "paid");
  $("main").innerHTML = `
    <div class="pagehead"><div><h1>Jobs</h1><p class="lede">${plural(active.length, "open job")}${paid.length ? ` · ${paid.length} paid` : ""}</p></div>
      <button class="btn primary addjob" type="button" data-act="new-job">+ Add a job</button></div>
    ${!S.jobs.length ? `<div class="allclear">No jobs yet. Tap <b>+ Add a job</b> when a car comes in.</div>` : `
    <div class="board cols4">${JOB_GROUPS.map(g => { const list = active.filter(g.f);
      return `<section class="lane" aria-labelledby="lane-${g.key}"><h2 id="lane-${g.key}">${esc(g.title)} <span class="count">${list.length}</span></h2><div class="hint">${esc(g.hint)}</div>
        ${list.length ? jobRows(list) : `<div class="laneempty">None right now</div>`}</section>`; }).join("")}</div>`}
    ${paid.length ? `<details class="panel"><summary>Paid jobs · ${paid.length}</summary><div class="inner">${jobRows(paid.slice(0, 100))}${paid.length > 100 ? `<div class="hint" style="margin-top:10px">Showing the newest 100. Use Find to look up older ones.</div>` : ""}</div></details>` : ""}`;
  fillPhotos($("main"));
}

function nextJobAction(j) {
  if (j.status === "estimate") return { title: j.approved_at ? "They said yes. Is the car here?" : "Waiting on the customer", label: "Car is here", act: "stage-start", help: j.approved_at ? "Tap when the car is in the bay and you're starting work." : "Text them the estimate so they can approve it. When the car is here, tap the button." };
  if (j.status === "in_progress") return { title: "Working on it", label: "Work is done", act: "stage-done", help: "Tap when the repair is finished and the car is ready to go." };
  if (j.status === "done") return { title: "Give them the bill", label: "Bill given", act: "stage-invoice", help: +j.amount ? `Print it, email it or hand it over, then tap the button. Price: ${money(j.amount)}.` : "Print it, email it or hand it over, then tap the button. You'll type the price." };
  if (j.status === "invoiced") return { title: `${money(balance(j))} still owed`, label: "Got paid", act: "pay", help: (ageDays(j) ?? 0) >= 14 ? `Bill given ${plural(ageDays(j) ?? 0, "day")} ago. A friendly reminder usually does it.` : "Tap when they pay, even part of it." };
  return null;
}
function trackHtml(j) {
  const idx = STAGES.findIndex(s => s.k === j.status);
  return `<ol class="track" aria-label="Job progress">${STAGES.map((s, i) => `<li class="${i < idx || j.status === "paid" ? "done" : i === idx ? "now" : ""}" ${i === idx ? 'aria-current="step"' : ""}><span class="dot" aria-hidden="true">${i < idx || j.status === "paid" ? "✓" : i + 1}</span><span class="tl">${s.k === "done" ? `<span class="lg">${s.label}</span><span class="sh">Done</span>` : s.label}</span>${i < idx || j.status === "paid" ? '<span class="sr">(done)</span>' : ""}</li>`).join("")}</ol>`;
}
function renderJob(id) {
  const j = jobById(id);
  if (!j) { $("main").innerHTML = `${backLink("jobs", "All jobs")}<div class="empty">That job isn't here anymore.</div>`; return; }
  if (j._pending) {
    const c0 = cust(j.customer_id);
    $("main").innerHTML = `${backLink("jobs", "All jobs")}
      <div class="head"><div><div class="eyebrow">${esc(c0?.name || "No customer")}</div><h1>${esc(vehicleText(j))}</h1><div class="small">${esc(j.title || "")}</div></div></div>
      <div class="notice ${j._error ? "bad" : ""}">${j._error ? `This job couldn't upload: ${esc(j._error)} <button class="linkbtn" type="button" data-act="retry-queue">Try again</button>` : `Saved on this device. ${navigator.onLine ? "Uploading now…" : "It will upload by itself when the internet is back."} You can change it after it uploads.`}</div>
      ${photoBox(j, true)}`;
    fillPhotos($("main")); return;
  }
  const c = cust(j.customer_id); const idx = STAGES.findIndex(s => s.k === j.status);
  const nx = nextJobAction(j); const lien = openLien(j.id); const anyLien = S.liens.find(l => l.job_id === j.id);
  const pays = jobPays(j); const a = ageDays(j);
  const v = j.vehicle || {}, p = j.property || {};
  const isEst = j.status === "estimate"; const docWord = isEst ? "estimate" : j.status === "paid" ? "receipt" : "bill";
  const billed = ["invoiced", "paid"].includes(j.status);
  const amtLabel = j.status === "paid" ? "Paid in full" : billed ? "Still owed" : "Price";
  const amtVal = !+j.amount ? "—" : j.status === "paid" ? money(j.amount) : billed ? money(balance(j)) : money(j.amount);
  const payLabel = billed || j.status === "done" ? "+ Add payment" : "+ Take a deposit";
  $("main").innerHTML = `
    ${backLink("jobs", "All jobs")}
    <div class="head"><div style="min-width:0"><div class="eyebrow">${esc(c?.name || "No customer")}</div><h1>${esc(vehicleText(j))}</h1><div class="small">${esc(j.title || "")}${c?.phone ? ` · <a href="tel:${esc(c.phone.replace(/[^\d+]/g, ""))}">${esc(c.phone)}</a>` : ""}</div></div>
      <div class="amount"><div class="l">${amtLabel}</div><div class="n">${amtVal}</div></div></div>
    ${trackHtml(j)}
    ${j.approved_at && isEst ? `<div class="notice good">${esc(j.approved_name || "The customer")} approved the estimate on ${esc(K.fmt(new Date(j.approved_at)))}.</div>` : ""}
    ${nx ? `<div class="nextcard ${j.status === "invoiced" && (a ?? 0) >= 30 ? "" : "calm"}"><div class="eyebrow">Next step</div><div class="headline">${esc(nx.title)}</div><div class="hint">${esc(nx.help)}</div>
      <div class="row2"><button class="btn primary big" type="button" data-act="${nx.act}" data-id="${j.id}">${esc(nx.label)}</button>
        ${owes(j) ? `<button class="btn" type="button" data-act="remind" data-id="${j.id}">Send reminder</button>` : ""}
        ${isEst ? `<button class="btn" type="button" data-act="cust-link" data-id="${j.id}">Text estimate to customer</button>` : ""}</div>
      ${idx > 0 ? `<div><button class="linkbtn quiet" type="button" data-act="stage-back" data-id="${j.id}">Undo: back to ${STAGE_LABEL[STAGES[idx - 1].k]}</button></div>` : ""}</div>`
    : `<div class="nextcard good"><div class="eyebrow">All done</div><div class="headline">Paid in full${j.paid_on ? " on " + esc(K.fmt(K.D(j.paid_on))) : ""}</div><div class="hint">Nothing left to do on this job.${anyLien ? " Its lien case is closed. Print the release from the lien case and give it to them." : ""}</div></div>`}
    <div class="secondary" aria-label="More for this job">
      <button class="btn" type="button" data-act="invoice" data-id="${j.id}">Print or email the ${docWord}</button>
      ${j.status === "invoiced" ? `<button class="btn" type="button" data-act="cust-link" data-id="${j.id}">Text bill to customer</button>` : ""}
      ${lien ? `<a class="btn" href="#lien/${lien.id}">Open lien case</a>` : anyLien ? `<a class="btn" href="#lien/${anyLien.id}">Lien case (closed)</a>` : ""}
    </div>
    <div class="twocol">
      <div class="box"><h3>Money ${j.status !== "paid" ? `<button class="linkbtn" type="button" data-act="pay" data-id="${j.id}">${payLabel}</button>` : ""}</h3>
        <dl class="kv"><dt>${isEst ? "Estimate" : "Price"}</dt><dd>${+j.amount ? money(j.amount) : `<button class="linkbtn" type="button" data-act="edit-job" data-id="${j.id}">Add the price</button>`}</dd>
          <dt>Paid</dt><dd>${money(j.amount_paid)}</dd>${billed ? `<dt>Still owed</dt><dd><b>${money(balance(j))}</b></dd>` : ""}
          ${j.last_reminded_on ? `<dt>Last reminder</dt><dd>${esc(K.fmt(K.D(j.last_reminded_on)))}</dd>` : ""}</dl>
        <div>${pays.length ? pays.map(pm => `<div class="pay ${pm.voided ? "void" : ""}"><div><b>${money(pm.amount)}</b> · ${esc(METHODS[pm.method] || "")}<div class="small">${esc(K.fmt(K.D(pm.paid_on)))}${pm.note ? " · " + esc(pm.note) : ""}</div>${pm.voided ? `<div class="small">Undone</div>` : ""}</div>
          ${pm.voided ? "" : pm._pending ? `<span class="chip soon">Waiting to upload</span>` : `<button class="linkbtn quiet" type="button" data-act="void-pay" data-id="${pm.id}">Undo</button>`}</div>`).join("") : `<div class="hint">No payments yet.</div>`}</div>
        ${owes(j) && !lien ? `<div class="hint" style="border-top:1px solid var(--line);padding-top:12px">Still not paid after a reminder or two? <button class="linkbtn" type="button" data-act="start-lien" data-id="${j.id}">Start a lien case</button></div>` : ""}</div>
      <div class="box"><h3>Details <button class="linkbtn" type="button" data-act="edit-job" data-id="${j.id}">Edit</button></h3>
        <dl class="kv">
          <dt>Customer</dt><dd>${c ? `<a href="#customer/${c.id}">${esc(c.name)}</a>` : "None"}</dd>
          ${j.kind === "property" ? `<dt>Address</dt><dd>${esc(p.address || "—")}</dd><dt>County</dt><dd>${esc(p.county || "—")}</dd>`
          : `<dt>${j.kind === "equipment" ? "Equipment" : "Car"}</dt><dd>${esc([v.year, v.make, v.model].filter(Boolean).join(" ") || "—")}</dd><dt>${j.kind === "equipment" ? "Serial" : "VIN"}</dt><dd class="mono">${esc(v.vin || "—")}</dd><dt>Plate</dt><dd>${esc(v.plate || "—")}</dd>`}
          <dt>Work</dt><dd>${esc(j.title || "—")}${j.description ? `<div class="small">${esc(j.description)}</div>` : ""}</dd>
          ${j.insurance && (j.insurance.insurer || j.insurance.claim) ? `<dt>Insurance</dt><dd>${esc([j.insurance.insurer, j.insurance.claim && "Claim #" + j.insurance.claim].filter(Boolean).join(" · "))}${j.insurance.adjuster ? `<div class="small">Adjuster: ${esc([j.insurance.adjuster, j.insurance.adjuster_phone].filter(Boolean).join(" · "))}</div>` : ""}${+j.insurance.deductible ? `<div class="small">Deductible: ${money(j.insurance.deductible)}</div>` : ""}</dd>` : ""}
          ${j.completed_on ? `<dt>Work done</dt><dd>${esc(K.fmt(K.D(j.completed_on)))}</dd>` : ""}${j.invoiced_on ? `<dt>Bill given</dt><dd>${esc(K.fmt(K.D(j.invoiced_on)))}</dd>` : ""}
        </dl></div>
    </div>
    ${photoBox(j, false)}
    <details class="dangerzone"><summary>${icon("trash")}Delete this job</summary><div style="display:grid;gap:10px;padding:4px 0 8px"><div class="hint">Only if it was added by mistake. Payments on it are deleted too. This can't be undone.</div><div><button class="btn danger" type="button" data-act="del-job" data-id="${j.id}">Delete job for good</button></div></div></details>`;
  fillPhotos($("main"));
}

// ---- add a job: one simple screen ----
const WORK_CHIPS = ["Collision repair", "Paint", "Dent repair", "Bumper", "Rust repair", "Frame", "Upholstery", "Insurance claim"];
let AJ = null;
function parseCar(s) {
  s = String(s || "").trim().replace(/\s+/g, " ");
  let m = s.match(/^((?:19|20)\d{2})\s+(\S+)\s*(.*)$/); if (m) return { year: m[1], make: m[2], model: m[3] };
  m = s.match(/^(\S+)\s*(.*?)\s+((?:19|20)\d{2})$/); if (m) return { year: m[3], make: m[1], model: m[2] };
  m = s.match(/^(\S+)\s*(.*)$/); return m ? { year: "", make: m[1], model: m[2] } : { year: "", make: "", model: "" };
}
function newJob(preCustomerId) {
  AJ = { customerId: preCustomerId || null, photos: [], start: null };
  const pc = preCustomerId ? cust(preCustomerId) : null;
  openModal(`<form id="ajForm" novalidate><div style="display:grid;gap:14px">
    <h2>Add a job</h2>
    <div class="field"><span class="req" style="font-size:var(--t-sm);color:var(--stone);font-weight:600" id="ajHereL">Is the car here?</span>
      <div class="seg" role="group" aria-labelledby="ajHereL" id="ajHere"><button type="button" data-ajstart="in_progress" aria-pressed="false">Yes, it's here</button><button type="button" data-ajstart="estimate" aria-pressed="false">No, just an estimate</button></div></div>
    <div class="photobtns">
      ${coarse ? `<label class="btn big photobtn"><input type="file" accept="image/*" capture="environment" id="ajCam" hidden>${icon("camera")}Take photo of estimate</label>
      <label class="btn photobtn2"><input type="file" accept="image/*" multiple id="ajPick" hidden>Choose from photos</label>`
      : `<label class="btn photobtn"><input type="file" accept="image/*" multiple id="ajPick" hidden>${icon("camera")}Add photos of the estimate</label><input type="file" id="ajCam" hidden>`}
    </div>
    <div class="thumbs" id="ajThumbs"></div>
    <div class="field" id="ajCustField"><label class="req" for="ajName">Customer name</label>
      <input id="ajName" autocomplete="off" autocapitalize="words" value="${esc(pc?.name || "")}" ${pc ? "readonly" : ""} placeholder="First and last name">
      <div class="sugg" id="ajSugg" hidden></div>
      <div class="hint" id="ajPicked">${pc ? `Existing customer${pc.phone ? " · " + esc(pc.phone) : ""} · <button class="linkbtn" type="button" data-act="aj-unpick">Change</button>` : ""}</div></div>
    <div class="field" id="ajPhoneField" ${pc ? "hidden" : ""}><label for="ajPhone">Phone</label><input id="ajPhone" type="tel" inputmode="tel" placeholder="(913) 555-0100"></div>
    <div class="field"><label class="req" for="ajCar">Car</label><input id="ajCar" placeholder="Like: 2014 Ford F-150" autocomplete="off" autocapitalize="words"><div class="hint" id="ajCarHint"></div></div>
    <div class="field"><label for="ajWork">What needs doing?</label><input id="ajWork" placeholder="Like: rear bumper and paint"></div>
    <div class="chips">${WORK_CHIPS.map(w => `<button type="button" class="chipbtn" data-ajchip="${esc(w)}">${esc(w)}</button>`).join("")}</div>
    <div class="field"><label for="ajAmt">Price ($)</label><input id="ajAmt" inputmode="decimal" placeholder="0.00"><div class="hint">Leave it blank if you don't know yet.</div></div>
    <details class="more"><summary>More details (optional)</summary><div class="grid" style="padding-top:10px">
      <div class="field wide"><label for="ajVin">VIN</label><input id="ajVin" autocapitalize="characters" spellcheck="false" placeholder="17 characters, on the dash or door"></div>
      <div class="field"><label for="ajPlate">Plate</label><input id="ajPlate"></div>
      <div class="field"><label for="ajEmail">Email</label><input id="ajEmail" type="email"></div>
      <div class="field wide"><label for="ajAddr">Customer's mailing address</label><input id="ajAddr" placeholder="Street, city, state ZIP"></div>
      <div class="field"><label for="ajIns">Insurance company</label><input id="ajIns" placeholder="If it's an insurance job"></div>
      <div class="field"><label for="ajClaim">Claim #</label><input id="ajClaim"></div>
      <div class="field wide"><label for="ajNotes">Notes</label><textarea id="ajNotes" rows="2"></textarea></div></div></details>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary big" type="submit">Save job</button></div>
  </div></form>`);
  const name = $("ajName"), sugg = $("ajSugg");
  name.addEventListener("input", () => {
    if (AJ.customerId) return;
    const q = name.value.trim().toLowerCase(); if (q.length < 2) { sugg.hidden = true; return; }
    const hits = S.customers.filter(c => c.name.toLowerCase().includes(q)).slice(0, 5);
    sugg.innerHTML = hits.map(c => `<button type="button" data-ajpick="${c.id}">${esc(c.name)} <span>${esc(c.phone || "")}</span></button>`).join("");
    sugg.hidden = !hits.length;
  });
  $("ajCar").addEventListener("input", () => { const p = parseCar(val("ajCar")); $("ajCarHint").textContent = val("ajCar") ? [p.year && "Year " + p.year, p.make && "Make " + p.make, p.model && "Model " + p.model].filter(Boolean).join(" · ") : ""; });
  $("ajVin").addEventListener("input", () => { const r = vinCheck(val("ajVin")); fieldErr("ajVin", r.ok ? "" : r.msg); fieldWarn("ajVin", r.ok ? r.warn || "" : ""); });
  const onFiles = async files => {
    for (const f of [...files]) {
      if (AJ.photos.length >= 8) { toast("That's 8 photos. Add more from the job page later."); break; }
      try { AJ.photos.push({ pid: uuid(), kind: "estimate", blob: await shrinkImage(f) }); } catch (ex) { toast(ex.message); }
    }
    modalDirty = true; ajThumbs();
  };
  $("ajCam").addEventListener("change", e => { onFiles(e.target.files); e.target.value = ""; });
  $("ajPick").addEventListener("change", e => { onFiles(e.target.files); e.target.value = ""; });
  $("ajForm").addEventListener("submit", e => { e.preventDefault(); saveNewJob(e.submitter); });
}
function ajThumbs() {
  $("ajThumbs").innerHTML = AJ.photos.map((p, i) => `<div class="thumb"><img src="${URL.createObjectURL(p.blob)}" alt="Estimate photo ${i + 1}"><button type="button" class="x" data-ajrm="${i}" aria-label="Remove photo">×</button></div>`).join("");
}
function ajPick(id) {
  const c = cust(id); if (!c) return; AJ.customerId = id;
  $("ajName").value = c.name; $("ajName").readOnly = true; $("ajSugg").hidden = true; $("ajPhoneField").hidden = true;
  $("ajPicked").innerHTML = `Existing customer${c.phone ? " · " + esc(c.phone) : ""} · <button class="linkbtn" type="button" data-act="aj-unpick">Change</button>`;
  fieldErr("ajName", ""); if (!coarse) $("ajCar").focus();
}
function ajUnpick() { AJ.customerId = null; $("ajName").readOnly = false; $("ajName").value = ""; $("ajPicked").innerHTML = ""; $("ajPhoneField").hidden = false; $("ajName").focus(); }
async function saveNewJob(btn) {
  let ok = true;
  const nm = val("ajName"), phone = val("ajPhone"), car = parseCar(val("ajCar")), vin = vinCheck(val("ajVin")), amt = parseMoney(val("ajAmt")), email = val("ajEmail").toLowerCase();
  if (!AJ.start) { fieldErr("ajHere", "Tap Yes or No."); ok = false; } else fieldErr("ajHere", "");
  if (!nm) { fieldErr("ajName", "Type the customer's name."); ok = false; } else fieldErr("ajName", "");
  if (!AJ.customerId && !phoneOk(phone)) { fieldErr("ajPhone", "Phone numbers have 10 digits."); ok = false; } else fieldErr("ajPhone", "");
  if (!val("ajCar") && !vin.value) { fieldErr("ajCar", "What car is it? Like: 2014 Ford F-150."); ok = false; } else fieldErr("ajCar", "");
  if (car.year && (+car.year < 1900 || +car.year > new Date().getFullYear() + 1)) { fieldErr("ajCar", "Check the year."); ok = false; }
  if (Number.isNaN(amt)) { fieldErr("ajAmt", "Use a dollar amount like 1250 or 1250.50 (or leave it blank)."); ok = false; } else fieldErr("ajAmt", "");
  if (!vin.ok) { $("modal").querySelector("details.more").open = true; fieldErr("ajVin", vin.msg); ok = false; }
  if (!emailOk(email)) { $("modal").querySelector("details.more").open = true; fieldErr("ajEmail", "That email doesn't look right."); ok = false; }
  if (!ok) { const bad = $("modal").querySelector(".field.invalid input, .field.invalid button"); if (bad) { bad.scrollIntoView({ block: "center", behavior: "smooth" }); if (!coarse || bad.tagName !== "INPUT") bad.focus({ preventScroll: true }); } return; }
  // same name as an existing customer? ask instead of making a duplicate
  if (!AJ.customerId) {
    const d = phone.replace(/\D/g, "").slice(-10);
    const m = S.customers.find(c => c.name.toLowerCase() === nm.toLowerCase() || (d.length === 10 && (c.phone || "").replace(/\D/g, "").endsWith(d)));
    if (m) {
      const same = await confirmBox({ title: `Is this ${m.name}?`, body: `You already have ${esc(m.name)}${m.phone ? " · " + esc(m.phone) : ""} as a customer. Same person?`, ok: "Yes, same person", cancel: "No, someone new" });
      if (same === null) return;
      if (same) { AJ.customerId = m.id; if (phone && !m.phone && navigator.onLine) await sb.from("shop_customers").update({ phone: fmtPhone(phone) }).eq("id", m.id); }
    }
  }
  await busy(btn, async () => {
    const jobId = uuid(); let customer = null; let customerId = AJ.customerId;
    if (!customerId) { customerId = uuid(); customer = { id: customerId, account_id: S.account.id, name: nm, phone: fmtPhone(phone), email, address: val("ajAddr"), notes: "" }; }
    const job = { id: jobId, account_id: S.account.id, customer_id: customerId, kind: "vehicle", title: val("ajWork") || "Estimate", description: val("ajNotes"),
      vehicle: { year: car.year, make: car.make, model: car.model, vin: vin.value || "", plate: val("ajPlate") }, property: {}, amount: amt, status: AJ.start,
      insurance: (val("ajIns") || val("ajClaim")) ? { insurer: val("ajIns"), claim: val("ajClaim") } : {} };
    try { await enqueue({ type: "job", customer, job, photos: AJ.photos }); }
    catch (ex) { toast("Couldn't save on this device: " + friendly(ex)); return; }
    await closeModal(true); go("job/" + jobId);
    if (navigator.onLine) { await flushQueue(); route(true); if (jobById(jobId) && !jobById(jobId)._pending) toast("Job saved.", null, { ok: true }); }
    else toast("Saved on this device. It will upload when you're back online.");
  });
}
function addPhotoToJob(j, files) {
  (async () => {
    let n = 0;
    for (const f of [...files]) {
      try { await enqueue({ type: "photo", jobId: j.id, kind: "estimate", pid: uuid(), blob: await shrinkImage(f) }); n++; } catch (ex) { toast(ex.message); }
    }
    if (!n) return;
    route(true);
    if (navigator.onLine) { await flushQueue(); route(true); } else toast("Photo saved on this device. It will upload when you're back online.");
  })();
}
async function viewPhoto(p) {
  const src = await photoSrc(p);
  openModal(`<div style="display:grid;gap:12px"><h2>${p.kind === "estimate" ? "Estimate photo" : "Photo"}</h2>
    ${src ? `<img class="bigphoto" src="${esc(src)}" alt="Photo">` : `<div class="notice">This photo will show when you're back online.</div>`}
    <div class="modalfoot">${!p._pending ? `<button class="btn danger spacer" type="button" data-act="del-photo" data-id="${p.id}">Delete photo</button>` : `<span class="small spacer">Waiting to upload</span>`}
    ${src ? `<a class="btn" href="${esc(src)}" target="_blank" rel="noopener">Open full size</a>` : ""}<button class="btn primary" type="button" data-act="close">Done</button></div></div>`);
}
async function deletePhoto(p) {
  if (!(await confirmBox({ title: "Delete this photo?", body: "It's gone for good.", ok: "Delete photo", danger: true }))) return;
  const { error } = await sb.from("shop_job_photos").delete().eq("id", p.id);
  if (error) return toast(friendly(error));
  sb.storage.from("shop-photos").remove([p.path]); // best effort; the record is already gone
  await closeModal(true); await reload(); route(true); toast("Photo deleted.");
}

function photoBox(j, pending) {
  const ps = jobPhotos(j);
  const pick = coarse
    ? `<label class="dropzone"><input type="file" accept="image/*" capture="environment" data-addphoto="${j.id}" hidden>${icon("camera")}<span>Take a photo of the estimate</span></label>
       <label class="linkbtn"><input type="file" accept="image/*" multiple data-addphoto="${j.id}" hidden>Or choose from your photos</label>`
    : `<label class="dropzone" data-drop="${j.id}"><input type="file" accept="image/*" multiple data-addphoto="${j.id}" hidden>${icon("camera")}<span>Choose photos from this computer</span><span class="small" style="font-weight:500">or drag them here</span></label>`;
  return `<div class="box"><h3>Estimate photos${ps.length ? ` · ${ps.length}` : ""}</h3>
    ${ps.length ? `<div class="thumbs">${ps.map((p, i) => `<button type="button" class="thumb" data-viewphoto="${p.id}" aria-label="Open photo ${i + 1}"><img data-photo="${p.id}" alt="">${p._pending ? `<span class="tag">Uploading</span>` : ""}</button>`).join("")}</div>` : ""}
    ${pending ? "" : pick}</div>`;
}

// ---- edit job ----
function editJob(j) {
  const v = j.vehicle || {}, p = j.property || {};
  openModal(`<form id="ejForm" novalidate><div style="display:grid;gap:16px"><h2>Edit job</h2>
    <div class="grid">
      <div class="field wide"><label for="ejCust">Customer</label><select id="ejCust"><option value="">No customer</option>${S.customers.map(c => `<option value="${c.id}" ${c.id === j.customer_id ? "selected" : ""}>${esc(c.name)}${c.phone ? " · " + esc(c.phone) : ""}</option>`).join("")}</select></div>
      ${j.kind !== "property" ? `<div class="field"><label for="ejYear">Year</label><input id="ejYear" inputmode="numeric" maxlength="4" value="${esc(v.year || "")}"></div>
        <div class="field"><label for="ejMake">Make</label><input id="ejMake" value="${esc(v.make || "")}"></div>
        <div class="field"><label for="ejModel">Model</label><input id="ejModel" value="${esc(v.model || "")}"></div>
        <div class="field"><label for="ejPlate">Plate</label><input id="ejPlate" value="${esc(v.plate || "")}"></div>
        <div class="field wide"><label for="ejVin">${j.kind === "equipment" ? "Serial number" : "VIN"}</label><input id="ejVin" value="${esc(v.vin || "")}" autocapitalize="characters" spellcheck="false"></div>`
      : `<div class="field wide"><label class="req" for="ejAddr">Property address</label><input id="ejAddr" value="${esc(p.address || "")}"></div>
        <div class="field"><label for="ejCounty">County</label><input id="ejCounty" value="${esc(p.county || "")}"></div>
        <div class="field check"><input type="checkbox" id="ejRes" ${p.residential ? "checked" : ""}><label for="ejRes">Residential</label></div>`}
      <div class="grouplabel">Insurance (if any)</div>
      <div class="field"><label for="ejIns">Insurance company</label><input id="ejIns" value="${esc(j.insurance?.insurer || "")}"></div>
      <div class="field"><label for="ejClaim">Claim #</label><input id="ejClaim" value="${esc(j.insurance?.claim || "")}"></div>
      <div class="field"><label for="ejAdj">Adjuster</label><input id="ejAdj" value="${esc(j.insurance?.adjuster || "")}"></div>
      <div class="field"><label for="ejAdjPh">Adjuster phone</label><input id="ejAdjPh" type="tel" value="${esc(j.insurance?.adjuster_phone || "")}"></div>
      <div class="field"><label for="ejDed">Deductible ($)</label><input id="ejDed" inputmode="decimal" value="${esc(j.insurance?.deductible || "")}"></div>
      <div class="grouplabel">Work</div>
      <div class="field wide"><label class="req" for="ejTitle">Short description</label><input id="ejTitle" value="${esc(j.title || "")}"></div>
      <div class="field wide"><label for="ejDesc">Notes</label><textarea id="ejDesc" rows="2">${esc(j.description || "")}</textarea></div>
      <div class="field"><label for="ejAmt">Price ($)</label><input id="ejAmt" inputmode="decimal" value="${esc(j.amount ?? "")}">${+j.amount_paid ? `<div class="hint">${money(j.amount_paid)} has been paid, so the price can't go below that.</div>` : ""}</div>
      ${["done", "invoiced", "paid"].includes(j.status) ? `<div class="field"><label for="ejDone">Work done on</label><input id="ejDone" type="date" max="${todayISO()}" value="${esc(j.completed_on || "")}"></div>` : ""}
      ${["invoiced", "paid"].includes(j.status) && j.invoiced_on ? `<div class="field"><label for="ejInv">Bill given on</label><input id="ejInv" type="date" max="${todayISO()}" value="${esc(j.invoiced_on || "")}"></div>` : ""}
    </div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save changes</button></div></div></form>`);
  if ($("ejVin")) $("ejVin").addEventListener("input", () => { const r = vinCheck(val("ejVin")); fieldErr("ejVin", r.ok ? "" : r.msg); fieldWarn("ejVin", r.ok ? r.warn || "" : ""); });
  $("ejForm").addEventListener("submit", async e => {
    e.preventDefault(); let ok = true;
    if (!val("ejTitle")) { fieldErr("ejTitle", "Say what work is being done."); ok = false; } else fieldErr("ejTitle", "");
    const amt = parseMoney(val("ejAmt"));
    if (Number.isNaN(amt)) { fieldErr("ejAmt", "Use a dollar amount like 1250 or 1250.50."); ok = false; }
    else if (+j.amount_paid > 0 && (amt == null || amt < +j.amount_paid)) { fieldErr("ejAmt", `They've already paid ${money(j.amount_paid)}. To lower it more, undo a payment first.`); ok = false; }
    else fieldErr("ejAmt", "");
    let vin = "";
    if ($("ejVin")) { const r = vinCheck(val("ejVin")); if (!r.ok) { fieldErr("ejVin", r.msg); ok = false; } vin = r.value || ""; }
    if ($("ejYear") && val("ejYear") && !/^\d{4}$/.test(val("ejYear"))) { fieldErr("ejYear", "Use a 4-digit year."); ok = false; }
    if ($("ejAddr") && !val("ejAddr")) { fieldErr("ejAddr", "Enter the property address."); ok = false; }
    const ded = parseMoney(val("ejDed")); if (Number.isNaN(ded)) { fieldErr("ejDed", "Use a dollar amount."); ok = false; } else fieldErr("ejDed", "");
    if (!phoneOk(val("ejAdjPh"))) { fieldErr("ejAdjPh", "Phone numbers have 10 digits."); ok = false; } else fieldErr("ejAdjPh", "");
    if ($("ejDone") && !dateRule("ejDone", { required: true })) ok = false;
    if ($("ejInv") && !dateRule("ejInv", { required: true, min: val("ejDone") || null, minLabel: "the day the work was done" })) ok = false;
    if (!ok) return;
    const row = { customer_id: $("ejCust").value || null, title: val("ejTitle"), description: val("ejDesc"), amount: amt,
      insurance: { insurer: val("ejIns"), claim: val("ejClaim"), adjuster: val("ejAdj"), adjuster_phone: fmtPhone(val("ejAdjPh")), deductible: parseMoney(val("ejDed")) ?? "" } };
    if (j.kind !== "property") row.vehicle = { year: val("ejYear"), make: val("ejMake"), model: val("ejModel"), plate: val("ejPlate"), vin };
    else row.property = { ...p, address: val("ejAddr"), county: val("ejCounty"), residential: $("ejRes").checked };
    if ($("ejDone")) row.completed_on = val("ejDone"); if ($("ejInv")) row.invoiced_on = val("ejInv");
    await busy(e.submitter, async () => {
      const { error } = await sb.from("shop_jobs").update(row).eq("id", j.id);
      if (error) return toast(friendly(error));
      await reload(); await closeModal(true); route(true); toast("Saved.");
    });
  });
}

// ---- stage changes ----
// save a change to a job; with no internet it's saved on this device and uploads later
async function jobUpdate(j, row) {
  const queue = async () => { try { const it = { type: "update", jobId: j.id, row, fromStatus: row.status ? j.status : null }; await enqueue(it); saveSnapshot(); return { queued: true, qid: it.qid }; } catch (ex) { return { error: ex }; } };
  if (!navigator.onLine || j._pending) return queue();
  const { error } = await sb.from("shop_jobs").update(row).eq("id", j.id);
  if (error && isNetErr(error)) return queue();
  return { error };
}
async function unqueue(qid, ifUploaded) {
  while (flushing) await new Promise(r => setTimeout(r, 100));
  flushing = true; let still = false;
  try {
    try { still = (await IDB.all()).some(i => i.qid === qid); } catch (e) { /* storage blocked */ }
    if (still) { try { await IDB.del(qid); } catch (e) { /* already gone */ } }
  } finally { flushing = false; }
  if (!still) { if (ifUploaded) return ifUploaded(); toast("Too late to undo here. Open the job to fix it."); return; }
  await mergePending(); saveSnapshot(); route(true); toast("Undone.");
}
async function setStage(j, row, msg, undoRow) {
  const before = { status: j.status, updated_at: j.updated_at };
  const r = await jobUpdate(j, row);
  if (r.error) { toast(friendly(r.error)); return false; }
  const onlineUndo = async () => {
    if (navigator.onLine) await reload();
    const now = jobById(j.id);
    if (!now || now.status !== row.status) { toast("That job has changed since, so there's nothing to undo."); return; }
    const r2 = await jobUpdate(now, undoRow);
    if (r2.error) return toast(friendly(r2.error));
    if (!r2.queued) await reload(); route(true); toast(`Undone. Back to “${STAGE_LABEL[before.status]}”.`);
  };
  if (r.queued) { route(true); toast(msg + " Will upload when online.", { label: "Undo", run: () => unqueue(r.qid, undoRow ? onlineUndo : null) }, { ok: true }); return true; }
  await reload(); route(true);
  toast(msg, undoRow ? { label: "Undo", run: onlineUndo } : null, { ok: true });
  return true;
}
function stageDone(j) {
  openModal(`<form id="sdForm" novalidate><div style="display:grid;gap:16px"><h2>Is the work done?</h2><div class="hint">${esc(jobName(j))}</div>
    <div class="grid"><div class="field"><label for="sdDate">Finished on</label><input id="sdDate" type="date" max="${todayISO()}" value="${todayISO()}"></div></div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Yes, work is done</button></div></div></form>`);
  $("sdForm").addEventListener("submit", async e => {
    e.preventDefault(); if (!dateRule("sdDate", { required: true })) return;
    await busy(e.submitter, async () => { if (await setStage(j, { status: "done", completed_on: val("sdDate") }, "Work done. Next: give them the bill.", { status: "in_progress", completed_on: null })) closeModal(true); });
  });
}
function stageInvoice(j) {
  const needAmt = !(+j.amount > 0);
  openModal(`<form id="siForm" novalidate><div style="display:grid;gap:16px"><h2>Did they get the bill?</h2><div class="hint">${esc(jobName(j))}. Tap Bill given once they have it (printed, emailed or texted).</div>
    <div class="grid"><div class="field"><label class="req" for="siAmt">Price on the bill ($)</label><input id="siAmt" inputmode="decimal" value="${esc(+j.amount ? j.amount : "")}" ${needAmt ? "autofocus" : ""}></div>
      <div class="field"><label for="siDate">Given on</label><input id="siDate" type="date" max="${todayISO()}" min="${esc(j.completed_on || "")}" value="${todayISO()}"></div></div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Bill given</button></div></div></form>`);
  $("siForm").addEventListener("submit", async e => {
    e.preventDefault();
    const amt = parseMoney(val("siAmt"));
    if (amt == null || Number.isNaN(amt) || amt <= 0) return fieldErr("siAmt", "Type the price on the bill.");
    if (amt < +j.amount_paid) return fieldErr("siAmt", `They've already paid ${money(j.amount_paid)}.`);
    fieldErr("siAmt", "");
    if (!dateRule("siDate", { required: true, min: j.completed_on, minLabel: "the day the work was done" })) return;
    await busy(e.submitter, async () => {
      const row = { status: "invoiced", amount: amt, invoiced_on: val("siDate"), completed_on: j.completed_on || val("siDate") };
      if (await setStage(j, row, "Bill given. It's on Money owed until they pay.", { status: "done", invoiced_on: null, amount: j.amount ?? null })) closeModal(true);
    });
  });
}
async function stageBack(j) {
  const idx = STAGES.findIndex(s => s.k === j.status); if (idx <= 0 || j.status === "paid") return;
  const prev = STAGES[idx - 1].k;
  if (!(await confirmBox({ title: `Move back to “${STAGE_LABEL[prev]}”?`, body: "Use this if you clicked the wrong button.", ok: "Move back" }))) return;
  const row = { status: prev }; if (j.status === "done") row.completed_on = null; if (j.status === "invoiced") row.invoiced_on = null;
  await setStage(j, row, `Moved back to “${STAGE_LABEL[prev]}”.`);
}
async function deleteJob(j) {
  const pays = jobPays(j).filter(p => !p.voided).length; const lien = S.liens.find(l => l.job_id === j.id);
  const extra = [pays ? `${plural(pays, "payment")} recorded on it will be deleted too.` : "", lien ? "Its lien case will be kept, but no longer linked to a job." : ""].filter(Boolean).join(" ");
  if (!(await confirmBox({ title: "Delete this job for good?", body: `${esc(jobName(j))}. ${esc(extra)} This can't be undone.`, ok: "Delete job", danger: true }))) return;
  const paths = jobPhotos(j).filter(p => p.path).map(p => p.path);
  const { error } = await sb.from("shop_jobs").delete().eq("id", j.id);
  if (error) return toast(friendly(error));
  if (paths.length) sb.storage.from("shop-photos").remove(paths);
  await reload(); go("jobs"); toast("Job deleted.");
}

// ================= PAYMENTS =================
function payPick() {
  const list = S.jobs.filter(j => j.status !== "paid" && +j.amount > 0 && balance(j) > 0)
    .sort((a, b) => (b.status === "invoiced") - (a.status === "invoiced") || (ageDays(b) ?? -1) - (ageDays(a) ?? -1));
  if (!list.length) { toast("Nobody owes anything right now. Add a price to a job first."); return; }
  openModal(`<h2>Who paid?</h2><div class="field"><label for="ppSearch">Search by name, car or phone</label><input id="ppSearch" type="search" autocomplete="off" data-nodirty></div>
    <div class="pickl" id="ppList">${list.map(j => `<button type="button" data-paypick="${j.id}" data-hay="${esc(jobName(j).toLowerCase() + " " + (cust(j.customer_id)?.phone || "").replace(/\D/g, ""))}">${esc(jobName(j))} <span>${money(balance(j))} ${j.status === "invoiced" ? "owed" : "price"}</span></button>`).join("")}</div>
    <div class="empty" id="ppNone" hidden>No one matches.</div>`);
  $("ppSearch").addEventListener("input", () => { const q = val("ppSearch").toLowerCase(); const d = q.replace(/\D/g, ""); let n = 0;
    $("ppList").querySelectorAll("button").forEach(b => { const show = !q || b.dataset.hay.includes(q) || (d.length >= 3 && b.dataset.hay.includes(d)); b.hidden = !show; n += show; }); $("ppNone").hidden = n > 0; });
}
function payModal(j) {
  const deposit = ["estimate", "in_progress"].includes(j.status);
  if (!(+j.amount > 0)) {
    openModal(`<form id="pfAmtForm" novalidate><div style="display:grid;gap:18px"><h2>First, what's the price?</h2><div class="hint">${esc(jobName(j))}. Type the full price of the job so we know what's left to pay.</div>
      <div class="field"><label class="req" for="pfTotal">Price of the job ($)</label><input id="pfTotal" inputmode="decimal" placeholder="0.00"></div>
      <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Next</button></div></div></form>`);
    $("pfAmtForm").addEventListener("submit", async e => {
      e.preventDefault(); const t = parseMoney(val("pfTotal"));
      if (t == null || Number.isNaN(t) || t <= 0) return fieldErr("pfTotal", "Type the price, like 1250 or 1250.50.");
      await busy(e.submitter, async () => { const r = await jobUpdate(j, { amount: t }); if (r.error) return toast(friendly(r.error)); if (!r.queued) await reload(); await closeModal(true); payModal(jobById(j.id)); });
    });
    return;
  }
  const bal = balance(j); let method = "";
  openModal(`<form id="pfForm" novalidate><div style="display:grid;gap:18px"><h2>${deposit ? "Take a deposit" : "Got paid"}</h2>
    <div class="hint">${esc(jobName(j))} · <b>${money(bal)}</b> ${deposit ? "left on the price of" : "owed of"} ${money(j.amount)}</div>
    <div class="field"><label class="req" for="pfAmt">How much did they pay? ($)</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><input id="pfAmt" inputmode="decimal" placeholder="0.00" style="flex:1 1 160px"><button class="btn" type="button" id="pfAll">Paid it all · ${money(bal)}</button></div></div>
    <div class="field"><span class="req" style="font-size:var(--t-sm);color:var(--stone);font-weight:600" id="pfHowL">How did they pay?</span><div class="chips" role="group" aria-labelledby="pfHowL">${Object.entries(METHODS).map(([k, t]) => `<button type="button" class="chipbtn" data-method="${k}" aria-pressed="false">${t}</button>`).join("")}</div><div class="fmsg" id="pfHowMsg" role="alert"></div></div>
    <div class="grid"><div class="field"><label for="pfDate">Paid on</label><input id="pfDate" type="date" max="${todayISO()}" value="${todayISO()}"></div>
      <div class="field"><label for="pfNote">Note (optional)</label><input id="pfNote" placeholder="Check #, claim #, etc."></div></div>
    <div class="notice good" id="pfFull" hidden>This pays the job off in full.</div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save payment</button></div></div></form>`);
  const upd = () => { const a = parseMoney(val("pfAmt")); $("pfFull").hidden = !(a >= bal && a > 0); };
  $("pfAmt").addEventListener("input", upd);
  $("pfAll").addEventListener("click", () => { $("pfAmt").value = bal.toFixed(2); fieldErr("pfAmt", ""); modalDirty = true; upd(); });
  $("modal").querySelectorAll("[data-method]").forEach(b => b.addEventListener("click", () => { method = b.dataset.method; $("pfHowMsg").textContent = ""; $("modal").querySelectorAll("[data-method]").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
  $("pfForm").addEventListener("submit", async e => {
    e.preventDefault(); let ok = true;
    const a = parseMoney(val("pfAmt"));
    if (a == null || Number.isNaN(a) || a <= 0) { fieldErr("pfAmt", "Type how much they paid, or tap Paid it all."); ok = false; }
    else if (a > bal) { fieldErr("pfAmt", `That's more than the ${money(bal)} left. If the price went up, edit the job's price first.`); ok = false; }
    else fieldErr("pfAmt", "");
    if (!method) { $("pfHowMsg").textContent = "Pick cash, card, check, insurance or other."; ok = false; }
    if (!dateRule("pfDate", { required: true })) ok = false;
    if (!ok) return;
    await busy(e.submitter, async () => {
      const wasLien = !!openLien(j.id);
      const row = { id: uuid(), job_id: j.id, account_id: S.account.id, amount: a, paid_on: val("pfDate"), method, note: val("pfNote") };
      let queued = !navigator.onLine || j._pending;
      if (!queued) { const { error } = await sb.from("shop_payments").insert(row); if (error && !isNetErr(error)) return toast(friendly(error)); if (error) queued = true; }
      let qid = null;
      if (queued) { try { const it = { type: "pay", row }; await enqueue(it); qid = it.qid; saveSnapshot(); } catch (ex) { return toast("Couldn't save on this device: " + friendly(ex)); } }
      else await reload();
      await closeModal(true); route(true);
      const nj = jobById(j.id);
      const left = nj ? balance(nj) : 0;
      toast((nj?.status === "paid" ? (wasLien && !queued ? "Paid in full. The lien case closed itself. Print the release from the lien case." : "Paid in full. Nice work.") : `Payment saved. ${money(left)} left.`) + (queued ? " Will upload when online." : ""),
        { label: "Undo", run: () => queued ? unqueue(qid, async () => { await reload(); return voidPayment(row.id, true); }) : voidPayment(row.id, true) }, { ok: true });
    });
  });
}
async function voidPayment(id, skipConfirm) {
  const pm = S.payments.find(p => p.id === id); if (!pm) return;
  if (!skipConfirm && !(await confirmBox({ title: `Undo this ${money(pm.amount)} payment?`, body: "It stays in the history, crossed out, and the amount goes back to owed.", ok: "Undo payment", danger: true }))) return;
  const { error } = await sb.from("shop_payments").update({ voided: true }).eq("id", id);
  if (error) return toast(friendly(error));
  await reload(); route(true); toast("Payment undone.");
}

// ---- email (Resend via the shop-email function; falls back to the phone's mail app) ----
async function sendEmail(to, subject, text) {
  const { error } = await sb.functions.invoke("shop-email", { body: { to, subject, text } });
  if (!error) return { ok: true };
  let msg = error.message || "";
  try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch (e) { /* not JSON */ }
  if (/not_configured/.test(msg) || /404|not found/i.test(msg)) return { notConfigured: true };
  throw new Error(msg);
}
async function emailOrMailto(to, subject, text) {
  try { const r = await sendEmail(to, subject, text); if (r.ok) { toast(`Emailed to ${to}.`); return true; } }
  catch (ex) { toast(friendly(ex) + " Opening your email app instead."); }
  location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  return false;
}

// ---- invoice / estimate / receipt ----
const docKind = j => j.status === "estimate" ? "Estimate" : j.status === "paid" ? "Receipt" : "Invoice";
function invoiceText(j) {
  const c = cust(j.customer_id) || {}; const v = j.vehicle || {}; const ins = j.insurance || {}; const a = S.account;
  const isEst = j.status === "estimate"; const pays = jobPays(j).filter(p => !p.voided);
  const L = [];
  L.push(a.name.toUpperCase(), a.address, a.phone, "", `${docKind(j).toUpperCase()}  ·  ${K.longFmt(K.TODAY)}`, "");
  L.push("Customer:  " + (c.name || "—")); if (c.address) L.push("           " + c.address); if (c.phone) L.push("           " + c.phone);
  L.push("", "Vehicle:   " + (vehicleText(j) || "—")); if (v.vin) L.push("VIN:       " + v.vin); if (v.plate) L.push("Plate:     " + v.plate);
  if (ins.insurer || ins.claim) L.push("", "Insurance: " + [ins.insurer, ins.claim && "Claim #" + ins.claim].filter(Boolean).join(" · "));
  L.push("", "Work:      " + (j.title || "—")); if (j.description) L.push(j.description);
  L.push("", "—".repeat(36));
  L.push(`${isEst ? "Estimate total" : "Total"}:  ${+j.amount ? money(j.amount) : "to be determined"}`);
  if (pays.length) pays.forEach(p => L.push(`Paid ${K.fmt(K.D(p.paid_on))} (${METHODS[p.method]}):  ${money(p.amount)}`));
  if (!isEst && +j.amount) L.push(`BALANCE DUE:  ${money(balance(j))}`);
  L.push("—".repeat(36), "", isEst ? "This estimate is good for 30 days. Hidden damage found during repair may change the price; we'll call you first." : (balance(j) > 0 ? `Please pay at the shop or call ${a.phone}.` : "Paid in full. Thank you!"), "", "Thank you for choosing " + a.name + ".");
  return L.join("\n");
}
function invoiceHtml(j) {
  const c = cust(j.customer_id) || {}; const v = j.vehicle || {}; const ins = j.insurance || {}; const a = S.account;
  const isEst = j.status === "estimate"; const pays = jobPays(j).filter(p => !p.voided);
  const lines = (...xs) => xs.filter(Boolean).map(esc).join("<br>");
  return `<div class="inv">
    <div class="ihead"><div><div class="ibrand">${esc(a.name.toUpperCase())}</div><div>${lines(a.address, a.phone)}</div></div>
      <div class="imeta"><div class="ikind">${docKind(j).toUpperCase()}</div><div>${esc(K.longFmt(K.TODAY))}</div><div style="color:#6a7380">No. ${esc(String(j.id).slice(0, 8).toUpperCase())}</div></div></div>
    <div class="icols">
      <div><div class="ilbl">${isEst ? "Prepared for" : "Bill to"}</div>${lines(c.name || "—", c.address, c.phone, c.email)}</div>
      <div><div class="ilbl">Vehicle</div>${lines(vehicleText(j), v.vin && "VIN " + v.vin, v.plate && "Plate " + v.plate)}</div>
      ${ins.insurer || ins.claim ? `<div><div class="ilbl">Insurance</div>${lines(ins.insurer, ins.claim && "Claim #" + ins.claim, ins.adjuster && "Adjuster " + ins.adjuster)}</div>` : ""}
    </div>
    <table><thead><tr><th>Work</th><th class="r">Amount</th></tr></thead>
      <tbody><tr><td><b>${esc(j.title || "Repair")}</b>${j.description ? `<div style="color:#4b5563">${esc(j.description)}</div>` : ""}</td><td class="r">${+j.amount ? money(j.amount) : "TBD"}</td></tr></tbody></table>
    <div class="itot"><div><span>${isEst ? "Estimate total" : "Total"}</span><span>${+j.amount ? money(j.amount) : "TBD"}</span></div>
      ${pays.map(p => `<div style="color:#4b5563"><span>Paid ${esc(K.fmt(K.D(p.paid_on)))} · ${esc(METHODS[p.method] || "")}</span><span>−${money(p.amount)}</span></div>`).join("")}
      ${!isEst && +j.amount ? `<div class="idue"><span>${balance(j) > 0 ? "Balance due" : "Paid in full"}</span><span>${money(balance(j))}</span></div>` : ""}</div>
    <div class="inote">${esc(isEst ? "This estimate is good for 30 days. Hidden damage found during repair may change the price; we'll call you first." : balance(j) > 0 ? `Please pay at the shop or call ${a.phone}. Thank you for choosing ${a.name}.` : `Paid in full. Thank you for choosing ${a.name}!`)}</div>
  </div>`;
}
const INV_CSS = `body{margin:0;font:14px/1.5 "Work Sans",Arial,sans-serif;color:#1a1f26}.inv{max-width:7.2in;margin:0 auto;padding:.2in 0;border-top:6px solid #F54503}.ihead{display:flex;justify-content:space-between;gap:16px;padding-top:14px}.ibrand{font:700 26px/1 "Bebas Neue",Impact,sans-serif;letter-spacing:.08em;color:#0f2740}.imeta{text-align:right}.ikind{font:700 24px/1 "Bebas Neue",Impact,sans-serif;letter-spacing:.06em;color:#C93A00}.icols{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:22px 0}.ilbl{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#6a7380;margin-bottom:2px}table{width:100%;border-collapse:collapse;margin:6px 0 14px}th{text-align:left;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6a7380;border-bottom:2px solid #1a1f26;padding:6px 0}td{padding:10px 0;border-bottom:1px solid #e3e6ea;vertical-align:top}.r{text-align:right}.itot{margin-left:auto;width:300px;display:grid;gap:4px}.itot div{display:flex;justify-content:space-between;gap:16px}.idue{border-top:2px solid #1a1f26;padding-top:8px;margin-top:4px;font-size:19px;font-weight:700}.inote{margin-top:22px;color:#4b5563;font-size:12.5px}@page{margin:.6in}`;
function printHtml(title, body, css) {
  const w = window.open("", "_blank");
  if (!w) { toast("Your browser blocked the print window. Allow pop-ups for daleskc.com."); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Work+Sans:wght@400;700&display=swap" rel="stylesheet"><style>${css}</style></head><body>${body}</body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 500);
}
function printText(title, text) { printHtml(title, esc(text), `body{font:15px/1.6 Georgia,"Times New Roman",serif;color:#111;max-width:7in;margin:0.8in auto;white-space:pre-wrap}@page{margin:0.7in}@media print{body{margin:0}}`); }
function invoiceModal(j) {
  const c = cust(j.customer_id) || {}; const kind = docKind(j);
  openModal(`<h2>${kind}</h2>
    ${!+j.amount ? `<div class="notice">No price on this job yet. <button class="linkbtn" type="button" data-act="edit-job" data-id="${j.id}">Add the price</button></div>` : ""}
    <div class="invwrap">${invoiceHtml(j)}</div>
    ${c.email ? "" : `<div class="hint">To email it, add ${esc(c.name ? c.name.split(" ")[0] + "'s" : "the customer's")} email on their customer page.</div>`}
    <div class="modalfoot">
      ${c.email ? `<button class="btn" type="button" data-act="email-invoice" data-id="${j.id}" title="${esc(c.email)}">Email it</button>` : ""}
      <button class="btn primary" type="button" data-act="print-invoice" data-id="${j.id}">Print ${kind.toLowerCase()}</button></div>`);
}

// ---- backups ----
function csvDownload(name, rows) {
  const cell = v => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const text = "﻿" + rows.map(r => r.map(cell).join(",")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function backup(kind) {
  const d = todayISO();
  if (kind === "jobs") csvDownload(`dales-jobs-${d}.csv`, [["Customer", "Phone", "Year", "Make", "Model", "VIN", "Plate", "Work", "Stage", "Total", "Paid", "Owed", "Work done", "Invoiced", "Paid in full", "Insurer", "Claim #", "Created"],
    ...S.jobs.filter(j => !j._pending).map(j => { const c = cust(j.customer_id) || {}; const v = j.vehicle || {}; const i = j.insurance || {};
      return [c.name, c.phone, v.year, v.make, v.model, v.vin, v.plate, j.title, STAGE_LABEL[j.status], j.amount, j.amount_paid, balance(j), j.completed_on, j.invoiced_on, j.paid_on, i.insurer, i.claim, (j.created_at || "").slice(0, 10)]; })]);
  if (kind === "customers") csvDownload(`dales-customers-${d}.csv`, [["Name", "Phone", "Email", "Address", "Notes", "Jobs", "Owes"],
    ...S.customers.filter(c => !c._pending).map(c => { const js = S.jobs.filter(j => j.customer_id === c.id); return [c.name, c.phone, c.email, c.address, c.notes, js.length, js.filter(owes).reduce((a, j) => a + balance(j), 0)]; })]);
  if (kind === "payments") csvDownload(`dales-payments-${d}.csv`, [["Date", "Customer", "Car", "Amount", "How", "Note", "Undone"],
    ...S.payments.map(p => { const j = jobById(p.job_id) || {}; return [p.paid_on, cust(j.customer_id)?.name, j.id ? vehicleText(j) : "", p.amount, METHODS[p.method], p.note, p.voided ? "yes" : ""]; })]);
  toast("Downloading. Open it with Excel, Numbers or Google Sheets.");
}

// ---- customer link (view estimate/bill, approve) ----
const linkUrl = tok => `${location.origin}${location.pathname.replace(/[^/]*$/, "")}estimate.html?t=${tok}`;
async function customerLink(j) {
  let link = S.links.find(l => l.job_id === j.id && l.active);
  if (!link) {
    const b = new Uint8Array(24); crypto.getRandomValues(b);
    const token = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
    const { data, error } = await sb.from("shop_job_links").insert({ token, account_id: S.account.id, job_id: j.id }).select().single();
    if (error) { toast(friendly(error)); return; }
    S.links.unshift(data); link = data;
  }
  const c = cust(j.customer_id) || {}; const url = linkUrl(link.token); const isEst = j.status === "estimate";
  const msg = `Hi ${(c.name || "").split(" ")[0] || "there"}, this is ${S.account.name}. Here's ${isEst ? "the estimate" : "your bill"} for your ${vehicleText(j)}: ${url}`;
  openModal(`<div style="display:grid;gap:14px"><h2>${isEst ? "Text estimate to customer" : "Text bill to customer"}</h2>
    <div class="hint">${isEst ? "They can see the estimate and photos, and tap Approve." : "They can see the work and what they still owe."} Only people with this link can open it.</div>
    <textarea class="copybox" id="lnkText" aria-label="Message to send">${esc(msg)}</textarea>
    ${link.viewed_at ? `<div class="notice good">They opened it on ${esc(K.fmt(new Date(link.viewed_at)))}.</div>` : ""}
    <div><button class="linkbtn danger" type="button" data-act="link-off" data-id="${j.id}">Turn off this link</button></div>
    <div class="modalfoot">
      <button class="btn ${c.phone || c.email ? "" : "primary"}" type="button" data-act="link-send" data-how="copy" data-id="${j.id}">Copy</button>
      ${c.email ? `<button class="btn ${c.phone ? "" : "primary"}" type="button" data-act="link-send" data-how="email" data-id="${j.id}">Email it</button>` : ""}
      ${c.phone ? `<button class="btn primary" type="button" data-act="link-send" data-how="sms" data-id="${j.id}">Text it</button>` : ""}</div></div>`);
}
async function linkSend(how, j) {
  const c = cust(j.customer_id) || {}; const text = $("lnkText").value; modalDirty = false;
  if (how === "copy") { try { await navigator.clipboard.writeText(text); toast("Copied. Paste it into a text or email."); } catch { $("lnkText").select(); toast("Selected. Press Ctrl+C or ⌘C to copy."); } }
  if (how === "sms") location.href = `sms:${(c.phone || "").replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
  if (how === "email") await emailOrMailto(c.email, `${j.status === "estimate" ? "Your estimate" : "Your bill"} from ${S.account.name}`, text);
}
async function linkOff(j) {
  if (!(await confirmBox({ title: "Turn off this link?", body: "Anyone who has it won't be able to open it anymore. You can send a fresh link anytime.", ok: "Turn it off", danger: true }))) return;
  const { error } = await sb.from("shop_job_links").update({ active: false }).eq("job_id", j.id).eq("active", true);
  if (error) return toast(friendly(error));
  await closeModal(true); await reload(); route(true); toast("Link turned off.");
}

// ---- help ----
const HELP = [
  ["A car comes in", "Tap + Add a job. Snap a photo of the estimate, type the customer's name and the car, and tap Save job."],
  ["You finish the work", "On Jobs, tap Work is done on that car."],
  ["You give them the bill", "Tap Bill given. Type the price if it isn't there yet."],
  ["They pay", "Tap Got paid, tap Paid it all (or type part of it), pick cash, card or check, and save. When it's all paid, the job moves to Paid by itself."],
  ["Send the estimate to a customer", "Open the job and tap Text estimate to customer. They can see it with the photos and tap Approve on their phone."],
  ["Someone hasn't paid", "The Today screen reminds you. Tap Send reminder. If they still don't pay after 30 days, open the job and tap Start a lien case. It walks you through each step."],
  ["You made a mistake", "Most buttons have an Undo. On a job, tap Edit to fix the name, the car or the price. Payments can be undone too."],
  ["No internet", "You can still add jobs and photos. A yellow bar says they're saved on this device, and they upload by themselves when the internet is back."],
  ["Find someone fast", "Tap the magnifying glass at the top (or press / on a computer) and type a name, phone number, car or VIN."]
];
const helpWho = () => ({ name: S.account?.help_name || "Dale Jr.", phone: S.account?.help_phone || "" });
function renderHelp() {
  const h = helpWho(); const tel = h.phone.replace(/[^\d+]/g, "");
  $("main").innerHTML = `<div class="pagehead"><div><div class="eyebrow">How to use the shop portal</div><h1>Help</h1></div><button class="btn" type="button" data-act="print-help">Print this page</button></div>
    <div class="nextcard calm"><div class="eyebrow">Stuck?</div><div class="headline">Call or text ${esc(h.name)}</div>
      ${tel ? `<div class="row2"><a class="btn primary big" href="tel:${esc(tel)}">${icon("phone")}Call ${esc(h.phone)}</a><a class="btn" href="sms:${esc(tel)}">Send a text</a></div>` : `<div class="hint">${esc(h.name)} set this up and can help with anything. ${S.isOwner ? `Add a phone number for them in <a href="#settings">Settings</a> so there's a call button here.` : ""}</div>`}</div>
    <section><h2>How do I…</h2><div class="todo">${HELP.map(([t, d], i) => `<div class="task easy"><div><div class="t">${i + 1}. ${esc(t)}</div><div class="s">${esc(d)}</div></div></div>`).join("")}</div></section>`;
}

// ---- reminders ----
function reminderText(j) {
  const c = cust(j.customer_id) || {}; const a = ageDays(j) ?? 0; const first = (c.name || "").split(" ")[0] || "there";
  const what = vehicleText(j), amt = money(balance(j)), shop = S.account.name, phone = S.account.phone || "the shop";
  if (a <= 30) return `Hi ${first}, this is ${shop}. Just a friendly reminder that ${amt} is still open for your ${what}. You can pay at the shop or call us at ${phone}. Thank you!`;
  if (a <= 60) return `Hi ${first}, ${shop} here. Your balance of ${amt} for the ${what} has been open ${a} days. Please call ${phone} this week to pay or set up a plan.`;
  return `Hi ${first}, this is ${shop}. The ${amt} balance for your ${what} has been open ${a} days. If we can't settle it soon, we'll have to start the Kansas lien process. Please call ${phone} right away so we can work it out.`;
}
function remindModal(j) {
  const c = cust(j.customer_id) || {}; const text = reminderText(j);
  openModal(`<h2>Payment reminder</h2>
    <div class="hint">${esc(c.name || "No customer")}${c.phone ? " · " + esc(c.phone) : ""}${c.email ? " · " + esc(c.email) : ""}</div>
    <div class="field"><label for="remText">Message (change it if you like)</label><textarea class="copybox" id="remText">${esc(text)}</textarea></div>
    ${!c.phone && !c.email ? `<div class="notice">This customer has no phone or email saved. Add one on their customer page to text or email from here, or copy the message.</div>` : ""}
    <div class="modalfoot">
      <button class="btn ${c.phone || c.email ? "" : "primary"}" type="button" data-remsend="copy" data-id="${j.id}">Copy</button>
      ${c.email ? `<button class="btn ${c.phone ? "" : "primary"}" type="button" data-remsend="email" data-id="${j.id}">Email it</button>` : ""}
      ${c.phone ? `<button class="btn primary" type="button" data-remsend="sms" data-id="${j.id}">Text it</button>` : ""}</div>`);
}
let askedReminder = null;
async function askReminderSent() {
  const j = askedReminder && jobById(askedReminder); askedReminder = null; if (!j) return;
  const c = cust(j.customer_id) || {};
  if (await confirmBox({ title: "Did the reminder go out?", body: `Tap Yes if you sent it to ${esc(c.name || "the customer")}. That way the app knows not to nag you for a week.`, ok: "Yes, I sent it", cancel: "No" })) { if (await markReminded(j)) { route(true); toast("Logged as reminded today.", null, { ok: true }); } }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && askedReminder) setTimeout(askReminderSent, 300); });
async function markReminded(j) {
  const r = await jobUpdate(j, { last_reminded_on: todayISO() });
  if (r.error) { toast("Couldn't log the reminder: " + friendly(r.error)); return false; }
  if (!r.queued) j.last_reminded_on = todayISO();
  return true;
}
async function remSend(how, j) {
  const c = cust(j.customer_id) || {}; const text = $("remText").value; modalDirty = false;
  if (how === "copy") {
    let copied = true; try { await navigator.clipboard.writeText(text); } catch { copied = false; $("remText").select(); }
    toast(copied ? "Copied. Paste it into a text or email." : "Selected. Press Ctrl+C or ⌘C to copy it.", { label: "I sent it", run: async () => { if (await markReminded(j)) { route(true); toast("Logged as reminded today.", null, { ok: true }); } } });
    return;
  }
  if (how === "email") { const sent = await emailOrMailto(c.email, "Balance due: " + S.account.name, text); if (sent) { await markReminded(j); await closeModal(true); route(true); return; } }
  if (how === "sms") location.href = `sms:${c.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
  await closeModal(true);
  askedReminder = j.id;
  setTimeout(() => { if (document.visibilityState === "visible") askReminderSent(); }, 1500);
}

// ================= MONEY OWED =================
const BUCKETS = [
  { key: "b0", label: "This month", test: d => d <= 30, color: "var(--good)" },
  { key: "b30", label: "1–2 months", test: d => d > 30 && d <= 60, color: "var(--stone)" },
  { key: "b60", label: "2–3 months", test: d => d > 60 && d <= 90, color: "var(--amber)" },
  { key: "b90", label: "Over 3 months", test: d => d > 90, color: "var(--rust)" }];
let arBucket = "all";
function renderMoney() {
  const open = S.jobs.filter(owes).map(j => ({ j, age: ageDays(j) ?? 0, bal: balance(j) })).sort((a, b) => b.age - a.age);
  const total = open.reduce((a, x) => a + x.bal, 0);
  const sums = BUCKETS.map(b => { const xs = open.filter(x => b.test(x.age)); return { ...b, n: xs.length, amt: xs.reduce((a, x) => a + x.bal, 0) }; });
  const shown = arBucket === "all" ? open : open.filter(x => BUCKETS.find(b => b.key === arBucket).test(x.age));
  const unb = S.jobs.filter(unbilled); const unbTotal = unb.reduce((a, j) => a + (+j.amount || 0), 0);
  $("main").innerHTML = `
    <div class="pagehead"><div><div class="eyebrow">Money owed to the shop</div><h1>${money(total)}</h1><p class="lede">${open.length ? `On ${plural(open.length, "bill")}. Oldest first.` : "Every bill is paid."}</p></div><button class="btn primary" type="button" data-act="pay-pick">${icon("money")}Got paid</button></div>
    ${total ? `<div class="agebar" role="img" aria-label="Money owed by age">${sums.map(b => b.amt ? `<span style="width:${(b.amt / total * 100).toFixed(2)}%;background:${b.color}"></span>` : "").join("")}</div>` : ""}
    <div class="aging" role="group" aria-label="Filter by how old the bill is">${sums.map(b => `<button class="bucket ${b.key} ${b.n ? "" : "empty0"}" type="button" data-bucket="${arBucket === b.key ? "all" : b.key}" aria-pressed="${arBucket === b.key}"><div class="k"><span class="sw" style="background:${b.color}"></span>${b.label}</div><div class="n">${b.n ? money(b.amt) : "—"}</div><div class="c">${b.n ? plural(b.n, "bill") : "None"}</div></button>`).join("")}</div>
    <section aria-labelledby="owedH"><h2 id="owedH">${arBucket === "all" ? "Who owes" : `${esc(BUCKETS.find(b => b.key === arBucket).label)} · ${shown.length}`}${arBucket !== "all" ? ` <button class="linkbtn" type="button" data-bucket="all" style="min-height:0;margin-left:8px;letter-spacing:0;text-transform:none">Show all ${open.length}</button>` : ""}</h2>
    <div class="list">${shown.length ? shown.map(({ j, age, bal }) => { const c = cust(j.customer_id); const lien = openLien(j.id);
      return `<div class="row mrow" data-href="job/${j.id}"><div><div class="tline"><a class="t" href="#job/${j.id}">${esc(c?.name || "No customer")}</a>${lien ? `<a class="chip over" href="#lien/${lien.id}">Lien open</a>` : ""}</div>
        <div class="s">${esc(vehicleText(j))} · ${plural(age, "day")}${+j.amount_paid ? ` · paid ${money(j.amount_paid)} of ${money(j.amount)}` : ""}${j.last_reminded_on ? ` · reminded ${daysSince(j.last_reminded_on) === 0 ? "today" : plural(daysSince(j.last_reminded_on), "day") + " ago"}` : ""}</div></div>
        <div class="amt num">${money(bal)}</div>
        <div class="r"><div class="acts">
          <button class="btn sm" type="button" data-act="remind" data-id="${j.id}">Reminder</button>
          <button class="btn sm" type="button" data-act="pay" data-id="${j.id}">Got paid</button>
        </div></div></div>`; }).join("") : `<div class="empty">${open.length ? "Nothing in this group." : "Nobody owes the shop money. When you tap Bill given on a job, it shows up here until it's paid."}</div>`}</div></section>
    ${unb.length ? `<section aria-labelledby="unbH"><h2 id="unbH">Not billed yet · ${unb.length}${unbTotal ? ` · ${money(unbTotal)}` : ""}</h2><div class="hint" style="margin:-6px 0 12px">Work is done but they don't have the bill yet, so it isn't counted above.</div>
      <div class="list">${unb.map(j => `<div class="row" data-href="job/${j.id}"><div><a class="t" href="#job/${j.id}">${esc(cust(j.customer_id)?.name || "No customer")}</a><div class="s">${esc(vehicleText(j))}${+j.amount ? " · " + money(j.amount) : " · no price yet"}${j.completed_on ? " · done " + esc(K.fmt(K.D(j.completed_on))) : ""}</div></div>
        <div class="r"><div class="acts"><button class="btn sm outline" type="button" data-act="stage-invoice" data-id="${j.id}">Bill given</button></div></div></div>`).join("")}</div></section>` : ""}`;
}

// ================= CUSTOMERS =================
let custFind = "";
function renderCustomers() {
  const card = c => {
    const js = S.jobs.filter(j => j.customer_id === c.id); const o = js.filter(owes).reduce((a, j) => a + balance(j), 0);
    const hay = [c.name, c.email, (c.phone || "").replace(/\D/g, ""), ...js.map(vehicleText)].join(" ").toLowerCase();
    return `<a class="ccard" href="#customer/${c.id}" data-hay="${esc(hay)}"><div class="t">${esc(c.name)}</div><div class="s">${esc([c.phone, c.email].filter(Boolean).join(" · ") || "No phone or email")}</div>
      <div class="jmeta"><span>${plural(js.length, "job")}</span>${o ? `<span class="chip soon">${money(o)} owed</span>` : ""}</div></a>`;
  };
  $("main").innerHTML = `
    <div class="pagehead"><div><h1>Customers</h1><p class="lede">${plural(S.customers.length, "customer")}</p></div><button class="btn primary" data-act="new-customer" type="button">+ Add a customer</button></div>
    ${S.customers.length ? `<div class="field" style="max-width:520px"><label for="custFind">Find a customer</label><input id="custFind" type="search" placeholder="Name, phone, email or car" autocomplete="off" value="${esc(custFind)}"></div>
    <div class="cgrid" id="cgrid">${S.customers.map(card).join("")}</div><div class="empty" id="custNone" hidden></div>`
    : `<div class="allclear">No customers yet. They're added for you when you add a job.</div>`}`;
  const f = $("custFind"); if (!f) return;
  const filter = () => { custFind = f.value; const q = f.value.trim().toLowerCase(); const d = q.replace(/\D/g, ""); let n = 0;
    $("cgrid").querySelectorAll(".ccard").forEach(el => { const show = !q || el.dataset.hay.includes(q) || (d.length >= 3 && el.dataset.hay.includes(d)); el.hidden = !show; n += show; });
    $("custNone").hidden = n > 0; $("custNone").textContent = `Nobody matches “${f.value}”.`; };
  f.addEventListener("input", filter); if (custFind) filter();
}
function renderCustomer(id) {
  const c = cust(id);
  if (!c) { $("main").innerHTML = `${backLink("customers", "All customers")}<div class="empty">That customer isn't here anymore.</div>`; return; }
  const js = S.jobs.filter(j => j.customer_id === c.id); const o = js.filter(owes).reduce((a, j) => a + balance(j), 0);
  const tel = (c.phone || "").replace(/[^\d+]/g, "");
  $("main").innerHTML = `
    ${backLink("customers", "All customers")}
    <div class="head"><div><div class="eyebrow">Customer</div><h1>${esc(c.name)}</h1></div><div class="amount"><div class="l">Owes</div><div class="n">${money(o)}</div></div></div>
    <div class="quick"><button class="btn primary" type="button" data-act="new-job-for" data-id="${c.id}">+ Add a job for ${esc(c.name.split(" ")[0])}</button>
      ${tel ? `<a class="btn" href="tel:${esc(tel)}">${icon("phone")}Call</a><a class="btn" href="sms:${esc(tel)}">Text</a>` : ""}${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">Email</a>` : ""}</div>
    <div class="twocol"><div class="box"><h3>Contact <button class="linkbtn" type="button" data-act="edit-customer" data-id="${c.id}">Edit</button></h3>
      <dl class="kv"><dt>Phone</dt><dd>${esc(c.phone || "—")}</dd><dt>Email</dt><dd>${esc(c.email || "—")}</dd><dt>Address</dt><dd>${esc(c.address || "—")}${!c.address ? `<div class="fwarn">Needed for lien letters</div>` : ""}</dd>${c.notes ? `<dt>Notes</dt><dd>${esc(c.notes)}</dd>` : ""}</dl></div>
      <section class="box"><h3>Jobs · ${js.length}</h3>${js.length ? jobRows(js, "", true) : `<div class="hint">No jobs yet.</div>`}</section></div>
    <details class="dangerzone"><summary>${icon("trash")}Delete this customer</summary><div style="display:grid;gap:10px;padding:4px 0 8px"><div class="hint">${js.length ? `${esc(c.name)} has ${plural(js.length, "job")}. Delete those first, so nothing gets lost.` : "This can't be undone."}</div><div><button class="btn danger" type="button" data-act="del-customer" data-id="${c.id}" ${js.length ? "disabled" : ""}>Delete customer</button></div></div></details>`;
  fillPhotos($("main"));
}
function customerModal(c) {
  const isNew = !c; c = c || {};
  openModal(`<form id="cuForm" novalidate><div style="display:grid;gap:16px"><h2>${isNew ? "New customer" : "Edit customer"}</h2>
    <div class="grid"><div class="field"><label class="req" for="cuName">Full name</label><input id="cuName" value="${esc(c.name || "")}"></div>
      <div class="field"><label for="cuPhone">Phone</label><input id="cuPhone" type="tel" value="${esc(c.phone || "")}"></div>
      <div class="field"><label for="cuEmail">Email</label><input id="cuEmail" type="email" value="${esc(c.email || "")}"></div>
      <div class="field wide"><label for="cuAddr">Mailing address</label><input id="cuAddr" value="${esc(c.address || "")}" placeholder="Street, city, state ZIP"><div class="hint">Used on certified lien letters.</div></div>
      <div class="field wide"><label for="cuNotes">Notes</label><textarea id="cuNotes" rows="2">${esc(c.notes || "")}</textarea></div></div>
    <div id="cuDup"></div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save customer</button></div></div></form>`);
  const dup = () => { const n = val("cuName").toLowerCase(); const m = n.length > 2 && S.customers.find(x => x.id !== c.id && x.name.toLowerCase() === n); $("cuDup").innerHTML = m ? `<div class="notice">There's already a customer named ${esc(m.name)}. <a href="#customer/${m.id}" data-act="close">Open them</a>, or keep going if this is a different person.</div>` : ""; };
  $("cuName").addEventListener("input", dup);
  $("cuForm").addEventListener("submit", async e => {
    e.preventDefault(); let ok = true;
    if (!val("cuName")) { fieldErr("cuName", "Enter a name."); ok = false; } else fieldErr("cuName", "");
    if (!phoneOk(val("cuPhone"))) { fieldErr("cuPhone", "Phone numbers have 10 digits."); ok = false; } else fieldErr("cuPhone", "");
    if (!emailOk(val("cuEmail"))) { fieldErr("cuEmail", "That email doesn't look right."); ok = false; } else fieldErr("cuEmail", "");
    if (!ok) return;
    const row = { account_id: S.account.id, name: val("cuName"), phone: fmtPhone(val("cuPhone")), email: val("cuEmail").toLowerCase(), address: val("cuAddr"), notes: val("cuNotes") };
    await busy(e.submitter, async () => {
      const q = isNew ? sb.from("shop_customers").insert(row).select().single() : sb.from("shop_customers").update(row).eq("id", c.id).select().single();
      const { data, error } = await q; if (error) return toast(friendly(error));
      await reload(); await closeModal(true); if (isNew) go("customer/" + data.id); else route(true); toast("Customer saved.");
    });
  });
}
async function deleteCustomer(c) {
  const n = S.jobs.filter(j => j.customer_id === c.id).length;
  if (n) { await confirmBox({ title: "Can't delete yet", body: `${esc(c.name)} has ${plural(n, "job")}. Delete or reassign those jobs first, so nothing gets lost.`, ok: "Got it", cancel: "" }); return; }
  if (!(await confirmBox({ title: `Delete ${c.name}?`, body: "This can't be undone.", ok: "Delete", danger: true }))) return;
  const { error } = await sb.from("shop_customers").delete().eq("id", c.id); if (error) return toast(friendly(error));
  await reload(); go("customers"); toast("Customer deleted.");
}

// ================= LIENS =================
function lienData(l) { const c = K.norm(l.data || (l.data = {})); c.track = l.track; return c; }
function lienLabel(l) {
  const c = lienData(l);
  const what = (c.track === "gc" || c.track === "sub") ? (c.property.address || "Property") : ([c.vehicle.year, c.vehicle.make, c.vehicle.model].filter(Boolean).join(" ") || "Vehicle");
  return `${c.owner.name || "Owner unknown"} · ${what}`;
}
const STEP_UI = {
  demand: { label: "I sent the demand letter", doc: "demand" },
  lookup: { label: "I have the owner and lienholder records", help: "Order the title and registration record from the Kansas Division of Vehicles or your county tag office. Every lienholder on it must get the notice of sale." },
  notice: { label: "I mailed the notice of sale", doc: "notice", ask: "notice" },
  handbill: { label: "I posted the sale notice", doc: "handbill" },
  sale: { label: "The sale happened", ask: "sale" },
  title: { label: "Inspection done and TR-96M given to the buyer" },
  buyertitle: { label: "The buyer applied for title" },
  rod: { label: "I filed the lien statement", ask: "filed" },
  foreclose: { label: "It's handled (paid, settled or in court)" },
  verify: { label: "I requested DMV verification", ask: "verify", help: "Send the request to the Kansas Division of Vehicles within 30 days of the tow." },
  publish: { label: "I published the auction notice", doc: "handbill" },
  warning: { label: "I served the warning statement" },
  extension: { label: "I filed the notice of extension", doc: "extension", skip: "I don't need more time" },
  file: { label: "I filed the lien statement", doc: "lien", ask: "filed" },
  serve: { label: "I served the owner a copy" }
};
function guidedSteps(c) { return K.steps(c).filter(s => s.kind === "due" && !(s.key === "extension" && c.done.extensionSkip)); }
function guidedNext(c) { return guidedSteps(c).find(s => !c.done[s.key]) || null; }
function missingFor(c) {
  const m = [];
  const need = (path, label) => { if (!String(get(c, path) ?? "").trim()) m.push({ path, label }); };
  need("owner.name", "Owner's name"); need("owner.address", "Owner's mailing address");
  if (c.track === "repair" || c.track === "tow") { need("vehicle.year", "Year"); need("vehicle.make", "Make"); need("vehicle.model", "Model"); need("vehicle.vin", "VIN or serial"); }
  else { need("property.address", "Property address"); need("property.county", "County"); need("property.legal", "Legal description (from the deed)"); if (c.track === "sub") need("contractor.name", "General contractor"); }
  if (!(+c.amount > 0)) m.push({ path: "amount", label: "Amount owed" });
  return m;
}
async function startLien(j) {
  if (j.status === "paid" || !(balance(j) > 0)) return toast("This job is paid. There's nothing to collect.");
  if (!["done", "invoiced"].includes(j.status)) { await confirmBox({ title: "Give them the bill first", body: "A lien is for work that's done and billed but unpaid. Tap Work is done, then Bill given, first.", ok: "Got it", cancel: "" }); return; }
  if (openLien(j.id)) return go("lien/" + openLien(j.id).id);
  const old = S.liens.find(l => l.job_id === j.id && l.status !== "open");
  if (old && await confirmBox({ title: "Reopen the earlier lien case?", body: "This job already had a lien case. Reopening keeps every step and date you entered.", ok: "Reopen it", cancel: "Start a new one" })) {
    const { error } = await sb.from("shop_liens").update({ status: "open" }).eq("id", old.id); if (error) return toast(friendly(error));
    await reload(); go("lien/" + old.id); toast("Lien case reopened."); return;
  }
  const a = ageDays(j) ?? 0;
  if (a < 30 && !(await confirmBox({ title: `It's only been ${plural(a, "day")}`, body: "Most shops send a reminder or two before starting a lien. Start the lien case anyway?", ok: "Start anyway", cancel: "Not yet" }))) return;
  const ind = S.account.industry;
  let track = j.kind === "property" ? (ind === "subcontractor" ? "sub" : "gc") : (ind === "towing" ? "tow" : "repair");
  const opts = j.kind === "property" ? ["gc", "sub"] : ["repair", "tow"];
  openModal(`<div style="display:grid;gap:16px"><h2>Start a lien case</h2><div class="hint">${esc(jobName(j))} · ${money(balance(j))} owed</div>
    <div><div class="hint" style="margin-bottom:6px">Which fits?</div><div class="choices">${opts.map(k => `<button type="button" class="choice" data-track="${k}" aria-pressed="${k === track}"><b>${esc(K.TRACKS[k].label)}</b><span>${esc(K.TRACKS[k].blurb)}</span></button>`).join("")}</div></div>
    <div class="hint">Everything we know from the job and customer gets filled in. The lien helper then walks you through it one step at a time.</div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" id="lnGo">Start lien case</button></div></div>`);
  $("modal").querySelectorAll("[data-track]").forEach(b => b.addEventListener("click", () => { track = b.dataset.track; $("modal").querySelectorAll("[data-track]").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
  $("lnGo").addEventListener("click", e => busy(e.currentTarget, async () => {
    const c = cust(j.customer_id) || {};
    const data = { claimant: { name: S.account.name, address: S.account.address, phone: S.account.phone },
      owner: { name: c.name || "", address: c.address || "" }, contractor: {},
      vehicle: j.kind === "property" ? {} : { ...(j.vehicle || {}) },
      property: j.kind === "property" ? { address: j.property?.address || "", county: j.property?.county || "", legal: "" } : {},
      residential: !!j.property?.residential, newResidential: false, amount: String(balance(j)), description: j.title || j.description || "",
      dates: { lastWork: j.completed_on || "", ...(track === "tow" ? { possession: j.completed_on || "" } : {}) }, saleTime: "", done: {} };
    const { data: row, error } = await sb.from("shop_liens").insert({ account_id: S.account.id, job_id: j.id, track, data }).select().single();
    if (error) return toast(friendly(error));
    await reload(); await closeModal(true); go("lien/" + row.id); toast("Lien case started. Follow the steps from the top.");
  }));
}
function renderLiens() {
  const open = S.liens.filter(l => l.status === "open"), closed = S.liens.filter(l => l.status !== "open");
  const row = l => { const c = lienData(l); const n = guidedNext(c); const st = n && n.date ? K.status(c, n) : null;
    return `<a class="row" href="#lien/${l.id}"><div><div class="t">${esc(lienLabel(l))}</div><div class="s">${esc(K.TRACKS[l.track].label)} · ${money(c.amount)}${n ? " · Next: " + esc(n.title) : ""}</div></div>
      <div class="r">${l.status !== "open" ? `<span class="chip done">Closed</span>` : st ? `<span class="date">${esc(K.fmt(n.date))}</span><span class="chip ${st.cls}">${esc(st.txt)}</span>` : n ? `<span class="chip up">Next step ready</span>` : `<span class="chip done">All steps done</span>`}</div></a>`; };
  $("main").innerHTML = `
    <div class="pagehead"><div><h1>Liens</h1><p class="lede">Kansas lien paperwork, one step at a time. Start one from any job that's 30+ days unpaid.</p></div></div>
    <section><h2>Open (${open.length})</h2><div class="list">${open.length ? open.map(row).join("") : `<div class="empty">No open lien cases. That's good news.</div>`}</div></section>
    ${closed.length ? `<details class="panel"><summary>Closed · ${closed.length}</summary><div class="inner"><div class="list">${closed.map(row).join("")}</div></div></details>` : ""}
    ${LEGAL}`;
}
let currentLien = null, currentDoc = null, saveT = null, saveState = "saved", lastLienStep = "";
function renderLien(id) {
  const l = S.liens.find(x => x.id === id);
  if (!l) { $("main").innerHTML = `${backLink("liens", "Lien cases")}<div class="empty">That lien case isn't here anymore.</div>`; return; }
  currentLien = l; const c = lienData(l); const veh = c.track === "repair" || c.track === "tow";
  const job = l.job_id && jobById(l.job_id); const closed = l.status !== "open";
  const n = guidedNext(c); const miss = missingFor(c); const ui = n ? (STEP_UI[n.key] || { label: "Mark this step done" }) : null;
  const all = guidedSteps(c); const doneCount = all.filter(s => c.done[s.key]).length;
  const st = n && n.date ? K.status(c, n) : null;
  $("main").innerHTML = `
    ${backLink("liens", "Lien cases")}
    <div class="head"><div><div class="eyebrow">${esc(K.TRACKS[c.track].label)} lien · ${esc(K.TRACKS[c.track].law)}${closed ? " · CLOSED" : ""}</div><h1>${esc(lienLabel(l))}</h1>
      <div class="small">${job ? `From job: <a href="#job/${job.id}">${esc(job.title || vehicleText(job))}</a>` : "Not linked to a job"}</div></div>
      <div class="amount"><div class="l">Amount owed</div><div class="n">${money(c.amount)}</div></div></div>
    ${closed ? `<div class="nextcard good"><div class="headline">This case is closed</div><div class="hint">${job && job.status === "paid" ? "The customer paid in full. Print the release below and give it to them." : "Closed without payment."}</div><div class="row2"><button class="btn" type="button" data-act="reopen-lien">Reopen case</button></div></div>`
    : n ? `<div class="nextcard ${st && st.cls === "over" ? "" : "calm"}"><div class="eyebrow">Step ${all.indexOf(all.find(s => s.key === n.key)) + 1} of ${all.length}</div><div class="headline">${esc(n.title)}</div>
        <div class="hint">${esc(n.detail)}${ui.help ? " " + esc(ui.help) : ""}</div>
        ${n.date ? `<div><span class="date">Due ${esc(K.fmt(n.date))}</span> <span class="chip ${st.cls}">${esc(st.txt)}</span></div>` : ""}
        ${ui.doc && miss.length ? `<div class="notice bad"><b>Fill these in before sending letters:</b><div class="grid" style="margin-top:10px">${miss.map(m => lfield(c, m.path, m.label)).join("")}</div></div>` : ""}
        <div class="row2">${ui.doc ? `<button class="btn" type="button" data-act="print-doc" data-doc="${ui.doc}">Print the ${esc(K.docsFor(c).find(d => d.key === ui.doc)?.label.toLowerCase() || "letter")}</button>` : ""}
          <button class="btn primary big" type="button" data-act="step-done" data-step="${n.key}">${esc(ui.label)}</button>
          ${ui.skip ? `<button class="btn ghost" type="button" data-act="step-skip" data-step="${n.key}">${esc(ui.skip)}</button>` : ""}</div></div>`
    : `<div class="nextcard good"><div class="headline">Every step is done</div><div class="hint">When the money's in, record the payment on the job and this case closes on its own. If you're giving up on it, close it below.</div></div>`}
    <div class="cols">
      <section>${(() => {
        const allS = K.steps(c); const isSk = s => s.key === "extension" && c.done.extensionSkip;
        const done = allS.filter(s => c.done[s.key] || isSk(s)); const up = allS.filter(s => !c.done[s.key] && !isSk(s) && !(n && s.key === n.key)).sort((a, b) => (all.some(x => x.key === a.key) ? 1 : 0) - (all.some(x => x.key === b.key) ? 1 : 0));
        const li = s => { const stt = K.status(c, s); const skipped = isSk(s); const num = all.indexOf(all.find(x => x.key === s.key)) + 1;
          return `<li class="step ${c.done[s.key] ? "isdone" : ""}"><span class="snum ${num ? "" : "note"}" aria-hidden="true">${c.done[s.key] ? "✓" : skipped ? "–" : num || "i"}</span>
          <div><div class="t">${esc(s.title)}</div><div class="d">${esc(s.detail)}</div>${s.cite ? `<details class="why"><summary>Why?</summary><span class="cite">${esc(s.cite)}</span></details>` : ""}
          ${(c.done[s.key] || skipped) && !closed ? `<div class="undo"><button class="linkbtn" type="button" data-act="step-undo" data-step="${s.key}">Undo</button></div>` : ""}</div>
          <div class="when">${s.kind === "info" || !s.date ? "" : `<span class="wdate">${s.kind === "after" ? "not before " : ""}${esc(K.fmt(s.date))}</span>`}<span class="chip ${skipped ? "info" : stt.cls}">${esc(skipped ? "Skipped" : stt.txt)}</span></div></li>`; };
        return `<details class="panel" ${closed ? "" : "open"}><summary>Coming up · ${up.filter(s => all.some(x => x.key === s.key)).length} ${up.length && up.length === up.filter(s => all.some(x => x.key === s.key)).length ? "" : "· plus notes"}</summary><div class="inner">${n ? `<div class="nowline"><span class="snum now" aria-hidden="true">${all.indexOf(all.find(s => s.key === n.key)) + 1}</span>Now: ${esc(n.title)}</div>` : ""}${up.length ? `<ul class="steps">${up.map(li).join("")}</ul>` : `<div class="hint">Nothing after this step.</div>`}</div></details>
          <details class="panel" style="margin-top:12px"><summary>Done · ${done.length}</summary><div class="inner">${done.length ? `<ul class="steps">${done.map(li).join("")}</ul>` : `<div class="hint">No steps done yet.</div>`}</div></details>`; })()}</section>
      <section class="stick"><h2>Letters and forms</h2><div class="docs" id="docs"></div><div class="sheet" id="sheet" tabindex="0" aria-label="Document preview"></div>
        <div class="sheetbar"><button class="btn outline" type="button" data-act="print-doc">Print</button><button class="btn" type="button" data-act="copy-doc">Copy text</button><span class="small" id="missing"></span></div></section>
    </div>
    <details class="panel" id="factsPanel"><summary>Case details (names, vehicle, dates) <span class="savestate" id="saveState"></span></summary><div class="grid" id="facts">${factsForm(c, veh)}</div></details>
    <div class="secondary">${!closed ? `<button class="btn" type="button" data-act="close-lien">Close this case</button>` : ""}</div>
    <details class="dangerzone"><summary>${icon("trash")}Delete this lien case</summary><div style="display:grid;gap:10px;padding:4px 0 8px"><div class="hint">Its steps and dates are lost for good. The job and payments stay.</div><div><button class="btn danger" type="button" data-act="del-lien">Delete case</button></div></div></details>
    ${LEGAL}`;
  const stepKey = l.id + (n ? n.key : "");
  if (stepKey !== lastLienStep) { lastLienStep = stepKey; if (ui && ui.doc) currentDoc = ui.doc; else if (closed) currentDoc = "release"; }
  renderDocs(); showSave();
}
function lfield(c, path, label, opts = {}) {
  const id = "lf-" + path.replace(/\./g, "-") + (opts.suffix || ""); const v = get(c, path) ?? "";
  if (opts.type === "check") return `<div class="field check"><input type="checkbox" id="${id}" data-path="${path}" ${v ? "checked" : ""}><label for="${id}">${esc(label)}</label></div>`;
  if (opts.type === "textarea") return `<div class="field wide"><label for="${id}">${esc(label)}</label><textarea id="${id}" data-path="${path}" rows="2">${esc(v)}</textarea></div>`;
  return `<div class="field ${opts.wide ? "wide" : ""}"><label for="${id}">${esc(label)}</label><input id="${id}" data-path="${path}" type="${opts.type || "text"}" value="${esc(v)}" ${opts.type === "date" ? `max="${todayISO()}"` : ""}></div>`;
}
function factsForm(c, veh) {
  const f = (p, l, o = {}) => lfield(c, p, l, { ...o, suffix: "-f" });
  let h = `<div class="grouplabel">Your shop</div>${f("claimant.name", "Business name")}${f("claimant.phone", "Phone")}${f("claimant.address", "Business address", { wide: true })}
    <div class="grouplabel">${veh ? "Owner" : "Property owner"}</div>${f("owner.name", "Owner name")}${f("owner.address", "Owner mailing address", { wide: true })}
    ${c.track === "sub" ? f("contractor.name", "General contractor") + f("contractor.address", "Contractor address") : ""}
    <div class="grouplabel">${veh ? "Vehicle" : "Property"} and money</div>`;
  if (veh) h += f("vehicle.year", "Year") + f("vehicle.make", "Make") + f("vehicle.model", "Model") + f("vehicle.vin", "VIN or serial") + f("vehicle.plate", "Plate") + f("lienholders", "Lienholders on the title (names and addresses, or None)", { type: "textarea" });
  else h += f("property.address", "Property address", { wide: true }) + f("property.county", "County") + f("property.legal", "Legal description") + f("residential", "Someone's home (residential)", { type: "check" }) + (c.residential ? f("newResidential", "Brand-new home construction", { type: "check" }) : "");
  h += f("amount", "Amount owed ($)") + f("description", "What the work was", { type: "textarea" }) + `<div class="grouplabel">Dates</div>`;
  if (c.track === "repair") h += f("dates.lastWork", "Work finished", { type: "date" }) + f("dates.released", "Gave the car back (leave blank if you still have it)", { type: "date" }) + f("dates.noticeMailed", "Notice of sale mailed", { type: "date" }) + lfield(c, "dates.saleDate", "Sale date", { type: "text", suffix: "-f" }).replace('type="text"', 'type="date"') + f("saleTime", "Sale time") + f("dates.filed", "Lien filed with register of deeds", { type: "date" });
  if (c.track === "tow") h += f("dates.possession", "Towed in on", { type: "date" }) + f("dates.verification", "DMV verification received", { type: "date" }) + f("dates.noticeMailed", "Notice of sale mailed", { type: "date" }) + lfield(c, "dates.saleDate", "Auction date", { suffix: "-f" }).replace('type="text"', 'type="date"') + f("saleTime", "Auction time");
  if (c.track === "gc" || c.track === "sub") h += f("dates.lastWork", "Last day you worked or delivered materials", { type: "date" }) + f("dates.filed", "Lien statement filed", { type: "date" });
  return h;
}
function renderDocs() {
  const c = lienData(currentLien); const docs = K.docsFor(c);
  if (!docs.some(d => d.key === currentDoc)) currentDoc = (currentLien.status !== "open" ? "release" : null) || docs[0].key;
  if (!docs.some(d => d.key === currentDoc)) currentDoc = docs[0].key;
  $("docs").innerHTML = docs.map(d => `<button class="btn sm docbtn" type="button" data-doc="${d.key}" aria-pressed="${d.key === currentDoc}">${esc(d.label)}</button>`).join("");
  const text = K.renderDoc(c, currentDoc);
  $("sheet").innerHTML = esc(text).replace(/⟦(.*?)⟧/g, '<span class="ph">[$1]</span>');
  const n = (text.match(/⟦/g) || []).length;
  $("missing").innerHTML = n ? `${plural(n, "blank")} to fill in, highlighted. <button class="linkbtn" type="button" data-act="fill-blanks">Fill them in</button>` : "Ready to print.";
  const pb = document.querySelector(".sheetbar [data-act=print-doc]"); if (pb) pb.textContent = n ? "Print draft" : "Print";
}
function showSave() {
  const el = $("saveState"); if (!el) return;
  el.className = "savestate" + (saveState === "error" ? " err" : "");
  el.innerHTML = saveState === "saving" ? "· Saving…" : saveState === "error" ? `· Not saved. <button class="linkbtn" type="button" data-act="retry-save">Try again</button>` : saveState === "saved" ? "· All changes saved" : "";
}
function saveLienSoon(delay = 600) {
  clearTimeout(saveT); saveState = "saving"; showSave();
  const l = currentLien;
  saveT = setTimeout(async () => {
    const data = { ...l.data }; delete data.track;
    const { error } = await sb.from("shop_liens").update({ data }).eq("id", l.id);
    saveState = error ? "error" : "saved"; showSave(); if (error) toast(friendly(error));
  }, delay);
}
window.addEventListener("beforeunload", e => { if (saveState === "saving" || saveState === "error" || modalDirty) { e.preventDefault(); e.returnValue = ""; } });

function earliestSale(c, mailed) {
  if (c.track === "tow") return [K.addDays(K.D(c.dates.possession), 30), K.addDays(K.D(mailed), 15)].filter(Boolean).sort((a, b) => b - a)[0] || null;
  return K.addDays(K.D(mailed), 10);
}
function stepDone(key) {
  const l = currentLien; const c = lienData(l); const ui = STEP_UI[key] || {};
  const finish = async (patch, btn) => busy(btn, async () => {
    const data = JSON.parse(JSON.stringify(l.data)); delete data.track; data.done = data.done || {};
    const prevVals = Object.fromEntries(Object.keys(patch || {}).map(p => [p, get(data, p) ?? ""])); const prevDone = !!data.done[key];
    if (patch) Object.entries(patch).forEach(([p, v]) => setp(data, p, v));
    data.done[key] = true;
    const { error } = await sb.from("shop_liens").update({ data }).eq("id", l.id);
    if (error) return toast(friendly(error));
    await closeModal(true); await reload(); route(true);
    toast("Step done. The next one is at the top.", { label: "Undo", run: async () => {
      const now = S.liens.find(x => x.id === l.id); if (!now) return;
      const back = JSON.parse(JSON.stringify(now.data)); delete back.track; back.done = back.done || {};
      back.done[key] = prevDone; Object.entries(prevVals).forEach(([p, v]) => setp(back, p, v));
      const { error: e2 } = await sb.from("shop_liens").update({ data: back }).eq("id", l.id);
      if (e2) return toast(friendly(e2)); await reload(); route(true); toast("Step undone.");
    } }, { ok: true });
  });
  if (ui.doc && missingFor(c).length) { toast("Fill in the missing details first (they're highlighted in red)."); return; }
  if (!ui.ask) {
    confirmBox({ title: "Mark this step done?", body: `<b>${esc(ui.label)}.</b> Only mark it once it's really done. You can undo it later.`, ok: "Yes, it's done" }).then(ok => ok && finish(null, null));
    return;
  }
  if (ui.ask === "filed") {
    openModal(`<form id="sfForm" novalidate><div style="display:grid;gap:16px"><h2>${esc(ui.label)}</h2><div class="field"><label class="req" for="sfDate">Filed on</label><input id="sfDate" type="date" max="${todayISO()}" value="${todayISO()}"></div>
      <div class="hint">This starts the 1-year clock to enforce the lien.</div><div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></div></form>`);
    $("sfForm").addEventListener("submit", e => { e.preventDefault(); if (dateRule("sfDate", { required: true })) finish({ "dates.filed": val("sfDate") }, e.submitter); });
  }
  if (ui.ask === "verify") {
    openModal(`<form id="svForm" novalidate><div style="display:grid;gap:16px"><h2>DMV verification</h2>
      <div class="field"><label for="svDate">Date you got the DMV reply (leave blank if you're still waiting)</label><input id="svDate" type="date" max="${todayISO()}" min="${esc(c.dates.possession || "")}"></div>
      <div class="hint">Once the reply comes in, you have 15 days to mail the notice of sale.</div><div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></div></form>`);
    $("svForm").addEventListener("submit", e => { e.preventDefault(); if (dateRule("svDate", { min: c.dates.possession, minLabel: "the tow date" })) finish(val("svDate") ? { "dates.verification": val("svDate") } : null, e.submitter); });
  }
  if (ui.ask === "notice") {
    if (c.track === "tow" && !c.dates.verification) { toast("Enter the date the DMV verification came back first (under Case details)."); return; }
    openModal(`<form id="snForm" novalidate><div style="display:grid;gap:16px"><h2>Notice of sale</h2>
      <div class="hint">The notice has to tell the owner the sale date, so pick both here.</div>
      <div class="grid"><div class="field"><label class="req" for="snMailed">Mailed on (certified)</label><input id="snMailed" type="date" max="${todayISO()}" value="${todayISO()}"></div>
        <div class="field"><label class="req" for="snSale">Sale date</label><input id="snSale" type="date" value="${esc(c.dates.saleDate || "")}"></div>
        <div class="field"><label for="snTime">Sale time</label><input id="snTime" value="${esc(c.saleTime || "10:00 AM")}"></div></div>
      <div class="hint" id="snHint"></div>
      <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></div></form>`);
    const hint = () => { const e = earliestSale(c, val("snMailed")); $("snHint").textContent = e ? `Earliest legal sale date: ${K.fmt(e)}.` : ""; if (e) $("snSale").min = K.iso(e); };
    $("snMailed").addEventListener("input", hint); hint();
    $("snForm").addEventListener("submit", e => {
      e.preventDefault();
      if (!dateRule("snMailed", { required: true })) return;
      const earliest = earliestSale(c, val("snMailed"));
      if (!dateRule("snSale", { required: true, notFuture: false, min: earliest ? K.iso(earliest) : null, minLabel: earliest ? K.fmt(earliest) + " (the earliest the law allows)" : "" })) return;
      if (c.track === "tow" && c.dates.verification && K.daysFrom(K.addDays(K.D(c.dates.verification), 15)) < 0 && val("snMailed") > K.iso(K.addDays(K.D(c.dates.verification), 15))) toast("Heads up: that's more than 15 days after the DMV reply. Check with an attorney.");
      finish({ "dates.noticeMailed": val("snMailed"), "dates.saleDate": val("snSale"), saleTime: val("snTime") }, e.submitter);
    });
  }
  if (ui.ask === "sale") {
    const earliest = c.dates.noticeMailed ? earliestSale(c, c.dates.noticeMailed) : null;
    openModal(`<form id="ssForm" novalidate><div style="display:grid;gap:16px"><h2>The sale</h2>
      <div class="field"><label class="req" for="ssDate">Date the sale happened</label><input id="ssDate" type="date" max="${todayISO()}" value="${esc(c.dates.saleDate && c.dates.saleDate <= todayISO() ? c.dates.saleDate : todayISO())}"></div>
      <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save</button></div></div></form>`);
    $("ssForm").addEventListener("submit", e => { e.preventDefault(); if (dateRule("ssDate", { required: true, min: earliest ? K.iso(earliest) : null, minLabel: earliest ? K.fmt(earliest) + " (the earliest legal date)" : "" })) finish({ "dates.saleDate": val("ssDate") }, e.submitter); });
  }
}
async function stepUndo(key, skipConfirm) {
  const l = currentLien; const c = lienData(l);
  if (!skipConfirm && !(await confirmBox({ title: "Undo this step?", body: "It goes back on the to-do list.", ok: "Undo step" }))) return;
  const data = JSON.parse(JSON.stringify(l.data)); delete data.track; data.done = { ...(data.done || {}) };
  if (key === "extension") delete data.done.extensionSkip;
  data.done[key] = false;
  const { error } = await sb.from("shop_liens").update({ data }).eq("id", l.id); if (error) return toast(friendly(error));
  await reload(); route(true);
}
async function stepSkip(key) {
  const l = currentLien; const c = lienData(l);
  if (!(await confirmBox({ title: "Skip the extension?", body: "You'll file the lien by the regular deadline.", ok: "Skip it" }))) return;
  c.done.extensionSkip = true; const data = { ...c }; delete data.track;
  const { error } = await sb.from("shop_liens").update({ data }).eq("id", l.id); if (error) return toast(friendly(error));
  await reload(); route(true);
}
async function closeLienCase() {
  const l = currentLien; const job = l.job_id && jobById(l.job_id);
  openModal(`<div style="display:grid;gap:16px"><h2>Close this case?</h2>
    <div class="choices">${job && job.status !== "paid" ? `<button type="button" class="choice" id="clPaid"><b>They paid</b><span>Record the payment. The case closes on its own.</span></button>` : ""}
      <button type="button" class="choice" id="clGive"><b>Close without payment</b><span>Writing it off or dropping the lien</span></button></div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button></div></div>`);
  if ($("clPaid")) $("clPaid").addEventListener("click", async () => { await closeModal(true); payModal(job); });
  $("clGive").addEventListener("click", async () => {
    await closeModal(true);
    if (!(await confirmBox({ title: "Close without payment?", body: "You can reopen it later if things change.", ok: "Close case" }))) return;
    const { error } = await sb.from("shop_liens").update({ status: "closed" }).eq("id", l.id); if (error) return toast(friendly(error));
    await reload(); route(true); toast("Case closed.");
  });
}
function printDoc(key) {
  const c = lienData(currentLien); const k = key || currentDoc; const label = K.docsFor(c).find(d => d.key === k)?.label || "Document";
  const text = K.renderDoc(c, k);
  const blanks = (text.match(/⟦/g) || []).length;
  const go2 = () => {
    const w = window.open("", "_blank");
    if (!w) { toast("Your browser blocked the print window. Allow pop-ups for daleskc.com, or use Copy text."); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(label)}</title><style>body{font:15px/1.6 Georgia,"Times New Roman",serif;color:#111;max-width:7in;margin:0.8in auto;white-space:pre-wrap}@page{margin:0.8in}@media print{body{margin:0}}</style></head><body>${esc(text.replace(/⟦(.*?)⟧/g, "________________"))}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 250);
  };
  if (blanks) confirmBox({ title: `${plural(blanks, "blank")} still empty`, body: "The printout will have lines to fill in by hand. Better to fill them in under Case details first.", ok: "Print anyway", cancel: "Go fill them in" }).then(ok => { if (ok) go2(); else { const d = $("factsPanel"); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth" }); } } });
  else go2();
}

// ================= SETTINGS =================
function renderSettings() {
  const a = S.account; const dis = S.isOwner ? "" : "disabled";
  const big = document.documentElement.classList.contains("big");
  $("main").innerHTML = `
    <div class="pagehead"><div><h1>Settings</h1><p class="lede">Signed in as ${esc(S.user.email)}</p></div></div>
    <div class="twocol">
      <form class="box" id="shopForm" novalidate><h3>Shop info</h3><div class="hint">Printed on every bill, letter and lien form.</div>
        <div class="field"><label for="stName">Business name</label><input id="stName" value="${esc(a.name)}" ${dis}></div>
        <div class="field"><label for="stAddr">Address</label><input id="stAddr" value="${esc(a.address)}" ${dis}></div>
        <div class="field"><label for="stPhone">Phone</label><input id="stPhone" type="tel" value="${esc(a.phone)}" ${dis}></div>
        ${S.isOwner ? `<div><button class="btn primary" type="submit">Save shop info</button></div>` : `<div class="hint">Only the owner or a co-owner can change this.</div>`}</form>
      <div class="box"><h3>Easier to read</h3><div class="hint">Make every word and button bigger on this device.</div>
        <div class="seg" role="group" aria-label="Text size"><button type="button" data-act="text-size" data-id="normal" aria-pressed="${!big}">Normal</button><button type="button" data-act="text-size" data-id="big" aria-pressed="${big}" style="font-size:1.15em">Bigger</button></div></div>
      <div class="box"><h3>Team</h3>
        <div class="hint">People who can sign in and use the portal. Co-owners can also change shop info and the team.</div>
        <div class="members">
          <div class="member"><div><b>Shop owner</b>${S.isDale ? " · you" : ""}</div></div>
          ${S.members.filter(m => m.active).map(m => `<div class="member"><div class="memail">${esc(m.email || "Team member")}${m.user_id === S.user.id ? " · you" : ""} ${m.co_owner ? `<span class="chip done">Co-owner</span>` : ""}</div>
            ${S.isOwner && m.user_id !== S.user.id ? `<div class="secondary"><button class="linkbtn" type="button" data-act="toggle-coowner" data-id="${m.user_id}">${m.co_owner ? "Remove co-owner" : "Make co-owner"}</button><button class="linkbtn danger" type="button" data-act="rm-member" data-id="${m.user_id}">Remove</button></div>` : ""}</div>`).join("")}
          ${S.invites.filter(i => i.active).map(i => `<div class="member"><div class="memail">${esc(i.email)}</div><div class="small">Invited. Hasn't signed in yet.</div>${S.isOwner ? `<div class="secondary"><button class="linkbtn danger" type="button" data-act="rm-invite" data-id="${esc(i.email)}">Cancel invite</button></div>` : ""}</div>`).join("")}</div>
        ${S.isOwner ? `<form id="invForm" novalidate style="display:grid;gap:10px"><div class="field"><label for="invEmail">Add someone by email</label><input id="invEmail" type="email" inputmode="email" placeholder="name@gmail.com"></div><div><button class="btn" type="submit">Add to team</button></div>
          <div class="hint">Then tell them to open daleskc.com/portal and tap “Create your login” with that same email.</div></form>` : ""}</div>
      <div class="box"><h3>Put it on your phone</h3>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><img src="icons/qr-install.png" alt="QR code that installs the app" style="width:132px;height:132px;border-radius:10px;background:#fff;padding:6px">
          <div class="hint" style="flex:1;min-width:180px">Point any phone's camera at this code to install the app. <a href="qr.html" target="_blank" rel="noopener">Print it as a sign</a> for the counter.</div></div>
        <div><button class="btn" type="button" data-act="install" id="installBtn" ${deferredInstall ? "" : "hidden"}>Install on this computer</button></div></div>
      ${S.isOwner ? `<form class="box" id="helpForm" novalidate><h3>Who to call for help</h3><div class="hint">Shows a Call button on the Help page.</div>
        <div class="grid"><div class="field"><label for="hpName">Name</label><input id="hpName" value="${esc(a.help_name || "Dale Jr.")}"></div>
          <div class="field"><label for="hpPhone">Phone</label><input id="hpPhone" type="tel" inputmode="tel" value="${esc(a.help_phone || "")}" placeholder="(913) 555-0100"></div></div>
        <div><button class="btn" type="submit">Save</button></div></form>` : ""}
      <div class="box"><h3>Backup</h3><div class="hint">Download a copy as spreadsheets. Everything is also backed up automatically every day.</div>
        <div class="secondary"><button class="btn" type="button" data-act="backup" data-id="jobs">Jobs</button><button class="btn" type="button" data-act="backup" data-id="customers">Customers</button><button class="btn" type="button" data-act="backup" data-id="payments">Payments</button></div></div>
      <form class="box" id="pwForm" novalidate><h3>Your login</h3>
        <input type="email" autocomplete="username" value="${esc(S.user.email)}" hidden>
        <div class="field"><label for="pw1">New password</label><input id="pw1" type="password" autocomplete="new-password"></div>
        <div class="field"><label for="pw2">Type it again</label><input id="pw2" type="password" autocomplete="new-password"></div>
        <div class="secondary"><button class="btn" type="submit">Change password</button><button class="btn ghost" type="button" data-act="sign-out">${icon("out")}Sign out</button></div></form>
    </div>
    ${LEGAL}`;
  $("shopForm").addEventListener("submit", async e => {
    e.preventDefault(); if (!S.isOwner) return; let ok = true;
    if (!val("stName")) { fieldErr("stName", "Required."); ok = false; } else fieldErr("stName", "");
    if (!val("stAddr")) { fieldErr("stAddr", "Required."); ok = false; } else fieldErr("stAddr", "");
    if (!phoneOk(val("stPhone"))) { fieldErr("stPhone", "Phone numbers have 10 digits."); ok = false; } else fieldErr("stPhone", "");
    if (!ok) return;
    await busy(e.submitter, async () => { const { error } = await sb.from("shop_accounts").update({ name: val("stName"), address: val("stAddr"), phone: fmtPhone(val("stPhone")) }).eq("id", S.account.id); if (error) return toast(friendly(error)); await reload(); renderSettings(); toast("Shop info saved. New letters will use it.", null, { ok: true }); });
  });
  if ($("helpForm")) $("helpForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!phoneOk(val("hpPhone"))) return fieldErr("hpPhone", "Phone numbers have 10 digits."); fieldErr("hpPhone", "");
    await busy(e.submitter, async () => { const { error } = await sb.from("shop_accounts").update({ help_name: val("hpName") || "Dale Jr.", help_phone: fmtPhone(val("hpPhone")) }).eq("id", S.account.id); if (error) return toast(friendly(error)); await reload(); renderSettings(); toast("Saved. The Help page has a Call button now.", null, { ok: true }); });
  });
  if ($("invForm")) $("invForm").addEventListener("submit", async e => {
    e.preventDefault(); const em = val("invEmail").toLowerCase();
    if (!em || !emailOk(em)) return fieldErr("invEmail", "Type their email address.");
    if (em === (S.user.email || "").toLowerCase()) return fieldErr("invEmail", "That's you.");
    if (S.members.some(m => m.active && m.email === em) || S.invites.some(i => i.active && i.email === em)) return fieldErr("invEmail", "They're already on the team.");
    await busy(e.submitter, async () => {
      const { error } = await sb.from("shop_invites").upsert({ account_id: S.account.id, email: em, active: true });
      if (error) return toast(friendly(error)); await reload(); renderSettings(); toast(`${em} added. Tell them to create a login at daleskc.com/portal.`, null, { ok: true });
    });
  });
  $("pwForm").addEventListener("submit", async e => {
    e.preventDefault(); const a1 = $("pw1").value, a2 = $("pw2").value;
    if (a1.length < 8) return fieldErr("pw1", "At least 8 characters."); fieldErr("pw1", "");
    if (a1 !== a2) return fieldErr("pw2", "The two passwords don't match."); fieldErr("pw2", "");
    await busy(e.submitter, async () => { const { error } = await sb.auth.updateUser({ password: a1 }); if (error) return toast(friendly(error)); $("pw1").value = $("pw2").value = ""; toast("Password changed.", null, { ok: true }); });
  });
}
function setBig(on) {
  document.documentElement.classList.toggle("big", on);
  try { localStorage.setItem("dab.big", on ? "1" : ""); } catch (e) { /* private mode */ }
}

// ================= global click handling =================
document.addEventListener("click", async e => {
  if ($("appView").hidden) return;
  const t = e.target.closest("[data-act],[data-bucket],[data-doc],[data-href],[data-ajpick],[data-ajrm],[data-ajchip],[data-ajstart],[data-viewphoto],[data-paypick],[data-remsend]");
  if (!t) return;
  const id = t.dataset.id;
  if (t.dataset.href && !e.target.closest("button,a,label,input")) { go(t.dataset.href); return; }
  if (t.dataset.bucket) { arBucket = t.dataset.bucket; renderMoney(); return; }
  if (t.dataset.doc && !t.dataset.act) { currentDoc = t.dataset.doc; renderDocs(); return; }
  if (t.dataset.paypick) { const j = jobById(t.dataset.paypick); await closeModal(true); if (j) payModal(j); return; }
  if (t.dataset.remsend) { const j = jobById(id); if (j) remSend(t.dataset.remsend, j); return; }
  // add-a-job form
  if (AJ && $("ajForm")) {
    if (t.dataset.ajpick) return ajPick(t.dataset.ajpick);
    if (t.dataset.ajrm) { AJ.photos.splice(+t.dataset.ajrm, 1); ajThumbs(); return; }
    if (t.dataset.ajchip) { const el = $("ajWork"); el.value = el.value ? el.value + ", " + t.dataset.ajchip.toLowerCase() : t.dataset.ajchip; modalDirty = true; return; }
    if (t.dataset.ajstart) { AJ.start = t.dataset.ajstart; fieldErr("ajHere", ""); $("modal").querySelectorAll("[data-ajstart]").forEach(b => b.setAttribute("aria-pressed", b === t)); return; }
  }
  if (t.dataset.viewphoto) { const p = S.photos.find(x => x.id === t.dataset.viewphoto); if (p) viewPhoto(p); return; }
  const act = t.dataset.act; if (!act) return;
  const j = id ? jobById(id) : null;
  const OFFLINE_OK = new Set(["close", "new-job", "new-job-for", "search", "more-menu", "tip-off", "text-size", "aj-unpick", "print-doc", "copy-doc", "retry-queue", "discard-queue", "invoice", "print-invoice", "backup", "install", "print-help", "big-text"]);
  const QUEUE_OK = new Set(["stage-start", "stage-done", "stage-invoice", "stage-back", "pay", "pay-pick"]);
  if (!navigator.onLine && !OFFLINE_OK.has(act) && !QUEUE_OK.has(act)) { toast("You're offline. That one needs internet. Adding jobs, photos, payments and moving jobs along still work."); return; }
  if (j && j._pending && !OFFLINE_OK.has(act) && !QUEUE_OK.has(act)) { toast("This job is still uploading. Try again in a minute."); return; }
  switch (act) {
    case "close": e.preventDefault(); if (t.tagName === "A") { await closeModal(true); go(t.getAttribute("href").slice(1)); } else closeModal(); return;
    case "new-job": return newJob();
    case "cust-link": return j && busy(t, () => customerLink(j));
    case "link-send": return j && linkSend(t.dataset.how, j);
    case "link-off": return j && linkOff(j);
    case "print-help": return printText("Shop portal help", "DALE'S AUTO BODY · SHOP PORTAL\nHow to use it\n\n" + HELP.map(([a, b], i) => `${i + 1}. ${a.toUpperCase()}\n   ${b}`).join("\n\n") + "\n\nWebsite: daleskc.com/portal");
    case "big-text": { const on = !document.documentElement.classList.contains("big"); setBig(on); if (!$("overlay").hidden) await closeModal(true); route(true); toast(on ? "Bigger text is on. Change it anytime in Settings." : "Text is back to normal size.", null, { ok: true }); return; }
    case "text-size": { setBig(id === "big"); route(true); return; }
    case "tip-off": { tipOff = true; try { localStorage.setItem("dab.tipoff", "1"); } catch (e2) { /* private mode */ } route(true); return; }
    case "search": return openSearch();
    case "more-menu": return moreMenu();
    case "invoice": return j && invoiceModal(j);
    case "print-invoice": return j && printHtml(docKind(j) + " - " + (cust(j.customer_id)?.name || ""), invoiceHtml(j), INV_CSS);
    case "email-invoice": { if (!j) return; const c = cust(j.customer_id); if (!c?.email) return; return busy(t, () => emailOrMailto(c.email, `${docKind(j)} from ${S.account.name}: ${vehicleText(j)}`, invoiceText(j))); }
    case "backup": return backup(id);
    case "install": if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; t.hidden = true; } return;
    case "aj-unpick": return ajUnpick();
    case "del-photo": { const p = S.photos.find(x => x.id === id); return p && deletePhoto(p); }
    case "retry-queue": { for (const it of await IDB.all()) if (it.error) { delete it.error; await IDB.put(it); } await mergePending(); route(true); return flushQueue(); }
    case "discard-queue": {
      const all = await IDB.all(); const jobOf = i => i.jobId || i.job?.id || i.row?.job_id;
      const deadJobs = new Set(all.filter(i => i.error && i.type === "job").map(i => i.job.id));
      const bad = all.filter(i => i.error || deadJobs.has(jobOf(i)));
      const extra = bad.length - all.filter(i => i.error).length;
      if (!(await confirmBox({ title: `Throw away ${plural(bad.length, "change")}?`, body: `Changes that couldn't upload will be deleted from this device.${extra ? ` That includes ${plural(extra, "photo or payment")} added to a job that never uploaded.` : ""}`, ok: "Throw away", danger: true }))) return;
      for (const it of bad) await IDB.del(it.qid); await mergePending(); saveSnapshot(); if (navigator.onLine) await reload(); return route(true); }
    case "new-job-for": return newJob(id);
    case "find": return openSearch();
    case "pay-pick": return payPick();
    case "pay": return j && payModal(j);
    case "void-pay": return voidPayment(id);
    case "remind": return j && remindModal(j);
    case "start-lien": return j && startLien(j);
    case "stage-start": return j && busy(t, () => setStage(j, { status: "in_progress" }, "Car is in the shop. Work started.", { status: "estimate" }));
    case "stage-done": return j && stageDone(j);
    case "stage-invoice": return j && stageInvoice(j);
    case "stage-back": return j && stageBack(j);
    case "edit-job": return j && editJob(j);
    case "del-job": return j && deleteJob(j);
    case "new-customer": return customerModal(null);
    case "edit-customer": return customerModal(cust(id));
    case "del-customer": return deleteCustomer(cust(id));
    case "step-done": return stepDone(t.dataset.step);
    case "step-undo": return stepUndo(t.dataset.step);
    case "step-skip": return stepSkip(t.dataset.step);
    case "print-doc": return printDoc(t.dataset.doc);
    case "copy-doc": { const text = K.renderDoc(lienData(currentLien), currentDoc).replace(/⟦(.*?)⟧/g, "[$1]"); try { await navigator.clipboard.writeText(text); toast("Copied."); } catch { const r = document.createRange(); r.selectNodeContents($("sheet")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected. Press Ctrl+C or ⌘C."); } return; }
    case "retry-save": return saveLienSoon(0);
    case "fill-blanks": { const d = $("factsPanel"); if (!d) return; d.open = true; const empty = [...d.querySelectorAll("input[data-path]:not([type=checkbox]),textarea[data-path]")].find(i => !i.value.trim()); d.scrollIntoView({ behavior: "smooth", block: "start" }); if (empty) setTimeout(() => empty.focus({ preventScroll: true }), 350); return; }
    case "close-lien": return closeLienCase();
    case "reopen-lien": { const { error } = await sb.from("shop_liens").update({ status: "open" }).eq("id", currentLien.id); if (error) return toast(friendly(error)); await reload(); route(true); return toast("Case reopened."); }
    case "del-lien": { if (!(await confirmBox({ title: "Delete this lien case?", body: "Its steps and dates are lost for good. The job and payments stay.", ok: "Delete case", danger: true }))) return; const { error } = await sb.from("shop_liens").delete().eq("id", currentLien.id); if (error) return toast(friendly(error)); await reload(); go("liens"); return toast("Lien case deleted."); }
    case "rm-member": { if (!(await confirmBox({ title: "Remove from the team?", body: "They won't be able to sign in to the shop portal anymore.", ok: "Remove", danger: true }))) return; const { error } = await sb.from("shop_members").update({ active: false }).eq("account_id", S.account.id).eq("user_id", id); if (error) return toast(friendly(error)); await reload(); renderSettings(); return toast("Removed."); }
    case "toggle-coowner": { const m = S.members.find(x => x.user_id === id); if (!m) return; if (!(await confirmBox({ title: m.co_owner ? "Remove co-owner?" : "Make co-owner?", body: m.co_owner ? "They keep using the portal but can't change shop info or the team." : "They'll be able to change shop info and add or remove team members.", ok: m.co_owner ? "Remove co-owner" : "Make co-owner" }))) return; const { error } = await sb.from("shop_members").update({ co_owner: !m.co_owner }).eq("account_id", S.account.id).eq("user_id", id); if (error) return toast(friendly(error)); await reload(); renderSettings(); return toast("Saved."); }
    case "rm-invite": { const { error } = await sb.from("shop_invites").update({ active: false }).eq("account_id", S.account.id).eq("email", id); if (error) return toast(friendly(error)); await reload(); renderSettings(); return toast("Invite cancelled."); }
    case "sign-out": {
      await mergePending(); const n = queueCache.length;
      if (!(await confirmBox({ title: "Sign out?", body: n ? `<b>${plural(n, "change")} on this device ${n === 1 ? "hasn't" : "haven't"} uploaded yet</b> and will be lost. Get online first if you can.` : "", ok: n ? "Sign out anyway" : "Sign out", danger: !!n }))) return;
      for (const it of queueCache) await IDB.del(it.qid).catch(() => {});
      try { localStorage.removeItem(SNAP_KEY); } catch {}
      userSignedOut = true; await sb.auth.signOut(); return; }
  }
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-href]")) { e.preventDefault(); go(e.target.dataset.href); } });

document.addEventListener("change", e => {
  const t = e.target; if (!t.dataset || !t.dataset.addphoto || !t.files?.length) return;
  const j = jobById(t.dataset.addphoto); if (j) addPhotoToJob(j, t.files); t.value = "";
});
// drag photos onto the drop area (computers)
["dragenter", "dragover"].forEach(ev => document.addEventListener(ev, e => { const z = e.target.closest?.("[data-drop]"); if (!z) return; e.preventDefault(); z.classList.add("over"); }));
document.addEventListener("dragleave", e => { const z = e.target.closest?.("[data-drop]"); if (z && !z.contains(e.relatedTarget)) z.classList.remove("over"); });
document.addEventListener("drop", e => {
  const z = e.target.closest?.("[data-drop]"); if (!z) return; e.preventDefault(); z.classList.remove("over");
  const files = [...(e.dataTransfer?.files || [])]; const j = jobById(z.dataset.drop);
  if (j && files.length) addPhotoToJob(j, files);
});
// lien case-detail edits: save as you type, validate dates
document.addEventListener("input", e => {
  const t = e.target; if (!currentLien || !t.dataset.path || !$("main").contains(t)) return;
  const c = lienData(currentLien);
  let v = t.type === "checkbox" ? t.checked : t.value;
  if (t.dataset.path === "vehicle.vin") { const r = vinCheck(v); fieldErr(t.id, r.ok ? "" : r.msg); fieldWarn(t.id, r.ok ? r.warn || "" : ""); if (!r.ok) return; }
  if (t.dataset.path === "amount" && v !== "" && Number.isNaN(parseMoney(v))) { fieldErr(t.id, "Use a dollar amount."); return; } else if (t.dataset.path === "amount") fieldErr(t.id, "");
  if (t.type === "date" && v && t.max && v > t.max && t.dataset.path !== "dates.saleDate") { fieldErr(t.id, "That's in the future."); return; } else if (t.type === "date") fieldErr(t.id, "");
  if (typeof v === "string") v = t.dataset.path === "amount" ? String(parseMoney(v) ?? "") : v.trim();
  setp(c, t.dataset.path, v);
  document.querySelectorAll(`[data-path="${t.dataset.path}"]`).forEach(o => { if (o !== t) { if (o.type === "checkbox") o.checked = !!v; else o.value = v; } });
  saveLienSoon();
});
document.addEventListener("change", e => {
  const t = e.target; if (!currentLien || !t.dataset.path || !$("main").contains(t)) return;
  if (t.dataset.path === "residential" || t.dataset.path === "newResidential") { const c = lienData(currentLien); if (t.dataset.path === "residential" && !t.checked) c.newResidential = false; clearTimeout(saveT); saveLienSoon(0); setTimeout(() => route(true), 50); return; }
  if (document.activeElement && document.activeElement.closest(".notice")) return;
  clearTimeout(saveT); saveLienSoon(0); setTimeout(() => { renderDocs(); }, 0);
});
document.addEventListener("focusout", e => {
  const t = e.target; if (!currentLien || !t.dataset?.path || !t.closest?.(".notice")) return;
  setTimeout(() => { if (!document.activeElement?.closest?.(".notice")) route(true); }, 700);
});

try { if (localStorage.getItem("dab.big")) document.documentElement.classList.add("big"); } catch (e) { /* private mode */ }
// ================= start =================
function showReset() { recovering = true; showOnly("authView"); setAuthMode("reset"); }
sb.auth.onAuthStateChange((ev, session) => {
  setTimeout(() => {
    if (ev === "PASSWORD_RECOVERY") return showReset();
    if (recovering) return;
    if (ev === "TOKEN_REFRESHED" || ev === "USER_UPDATED") return;
    boot(session);
  }, 0);
});
sb.auth.getSession().then(({ data }) => { if (!recovering && !/type=recovery/.test(location.hash)) boot(data.session); });
if (!navigator.onLine) window.addEventListener("load", () => { if ($("netbar")) $("netbar").hidden = false; });
})();
