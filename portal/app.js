(() => {
"use strict";
const SB_URL = "https://uwhtxhxetjbkngjypkcx.supabase.co";
const SB_KEY = "sb_publishable_aGD67KSXQybtbagP_DJfDQ_7TaFb4gI"; // publishable (public) key; data is protected by row-level security
const sb = window.supabase.createClient(SB_URL, SB_KEY);
const K = window.KS;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const get = (o, p) => p.split(".").reduce((a, k) => a == null ? a : a[k], o);
const setp = (o, p, v) => { const ks = p.split("."); let a = o; ks.slice(0, -1).forEach(k => { a[k] = a[k] || {}; a = a[k]; }); a[ks.at(-1)] = v; };
const nul = v => (v === "" || v === undefined) ? null : v;
let toastT;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3200); }
function fail(e, where) { console.error(where, e); toast((where ? where + ": " : "") + (e?.message || "Something went wrong. Try again.")); }

const S = { user: null, account: null, customers: [], jobs: [], liens: [] };

// ---------------- auth ----------------
let authMode = "signin";
function setAuthMode(m) {
  authMode = m;
  $("authTitle").textContent = m === "signin" ? "Sign in" : "Create the shop login";
  $("authSubmit").textContent = m === "signin" ? "Sign in" : "Create account";
  $("authSwitchText").textContent = m === "signin" ? "New here?" : "Already have an account?";
  $("authSwitch").textContent = m === "signin" ? "Create an account" : "Sign in";
  $("authPass").autocomplete = m === "signin" ? "current-password" : "new-password";
  $("authMsg").textContent = ""; $("authMsg").className = "msg";
}
$("authSwitch").addEventListener("click", e => { e.preventDefault(); setAuthMode(authMode === "signin" ? "signup" : "signin"); });
$("authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("authEmail").value.trim(), password = $("authPass").value;
  const msg = $("authMsg");
  if (!email || password.length < 8) { msg.className = "msg err"; msg.textContent = "Enter your email and a password of at least 8 characters."; return; }
  $("authSubmit").disabled = true; msg.className = "msg"; msg.textContent = authMode === "signin" ? "Signing in…" : "Creating your account…";
  try {
    if (authMode === "reset") {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      recovering = false; bootedFor = undefined; toast("Password updated.");
      const { data } = await sb.auth.getSession(); boot(data.session); return;
    }
    if (authMode === "signin") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setAuthMode("signin"); msg.className = "msg err";
        msg.textContent = "That email already has an account. Sign in with your existing password, or tap Forgot password below.";
        return;
      }
      if (!data.session) { setAuthMode("signin"); msg.textContent = "Check your email for a confirmation link, then sign in here."; }
    }
  } catch (err) {
    msg.className = "msg err";
    msg.textContent = /invalid login/i.test(err.message || "") ? "Wrong email or password. Tap Forgot password below to reset it." : (err.message || "That didn't work. Try again.");
  }
  finally { $("authSubmit").disabled = false; }
});
let recovering = false;
$("authForgot").addEventListener("click", async e => {
  e.preventDefault();
  const email = $("authEmail").value.trim(), msg = $("authMsg");
  if (!email) { msg.className = "msg err"; msg.textContent = "Type your email above first, then tap Forgot password."; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  msg.className = error ? "msg err" : "msg";
  msg.textContent = error ? error.message : "If that email has an account, a reset link is on its way. Open it on this device.";
});
function showReset() {
  recovering = true;
  ["setupView", "appView"].forEach(v => $(v).hidden = true); $("authView").hidden = false;
  authMode = "reset";
  $("authTitle").textContent = "Set a new password"; $("authSubmit").textContent = "Save new password";
  $("authEmail").closest(".field").hidden = true; $("authPass").autocomplete = "new-password";
  $("authSwitchRow").hidden = true; $("authMsg").textContent = "";
}
if (new URLSearchParams(location.search).get("setup") === "1") { $("authSwitchWrap").hidden = false; setAuthMode("signup"); }

$("setupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const row = { owner_id: S.user.id, name: $("sName").value.trim(), address: $("sAddr").value.trim(), phone: $("sPhone").value.trim(), industry: $("sInd").value };
  if (!row.name || !row.address) { $("setupMsg").className = "msg err"; $("setupMsg").textContent = "Business name and address are required."; return; }
  const { data, error } = await sb.from("shop_accounts").insert(row).select().single();
  if (error) { $("setupMsg").className = "msg err"; $("setupMsg").textContent = error.message; return; }
  S.account = data; await loadAll(); showApp();
});
$("signOut").addEventListener("click", async () => { await sb.auth.signOut(); });

let bootedFor; // undefined until the first boot, so a signed-out first load still renders
async function boot(session) {
  const uid = session?.user?.id || null;
  if (uid === bootedFor) return;
  bootedFor = uid;
  ["authView", "setupView", "appView"].forEach(v => $(v).hidden = true);
  if (!session) { S.user = null; $("authView").hidden = false; return; }
  S.user = session.user;
  const { data, error } = await sb.from("shop_accounts").select("*").maybeSingle();
  if (error) { fail(error, "Loading your shop"); $("authView").hidden = false; return; }
  if (!data) { $("setupView").hidden = false; $("sName").focus(); return; }
  S.account = data;
  await loadAll();
  showApp();
}
async function loadAll() {
  const [c, j, l] = await Promise.all([
    sb.from("shop_customers").select("*").order("name"),
    sb.from("shop_jobs").select("*").order("created_at", { ascending: false }),
    sb.from("shop_liens").select("*").order("created_at", { ascending: false })
  ]);
  if (c.error || j.error || l.error) fail(c.error || j.error || l.error, "Loading data");
  S.customers = c.data || []; S.jobs = j.data || []; S.liens = l.data || [];
}
function showApp() {
  ["authView", "setupView"].forEach(v => $(v).hidden = true);
  $("appView").hidden = false;
  route();
}

// ---------------- job helpers ----------------
const STATUS = { estimate: "Estimate", in_progress: "In progress", done: "Done", invoiced: "Invoiced", paid: "Paid" };
const balance = j => Math.max(0, (+j.amount || 0) - (+j.amount_paid || 0));
const ageDays = j => { const d = K.D(j.invoiced_on || j.completed_on); return d ? Math.round((K.TODAY - d) / 864e5) : null; };
const isUnpaid = j => (j.status === "done" || j.status === "invoiced") && balance(j) > 0;
const isOverdue = j => isUnpaid(j) && (ageDays(j) ?? 0) >= 30;
const cust = id => S.customers.find(c => c.id === id);
const openLien = jobId => S.liens.find(l => l.job_id === jobId && l.status === "open");
function jobLabel(j) {
  if (j.title) return j.title;
  if (j.kind === "property") return j.property?.address || "Property job";
  const v = j.vehicle || {}; return [v.year, v.make, v.model].filter(Boolean).join(" ") || "Untitled job";
}
function statusChip(j) {
  if (j.status === "paid") return `<span class="chip paid">Paid</span>`;
  if (isOverdue(j)) return `<span class="chip over">${ageDays(j)} days unpaid</span>`;
  if (isUnpaid(j)) return `<span class="chip soon">Unpaid</span>`;
  return `<span class="chip up">${esc(STATUS[j.status])}</span>`;
}
function lienData(l) { const c = K.norm(l.data || {}); c.track = l.track; return c; }
function lienLabel(l) {
  const c = lienData(l);
  const what = (c.track === "gc" || c.track === "sub") ? (c.property.address || "Property") : ([c.vehicle.year, c.vehicle.make, c.vehicle.model].filter(Boolean).join(" ") || "Vehicle");
  return `${what} · ${c.owner.name || "owner unknown"}`;
}

// ---------------- routing ----------------
window.addEventListener("hashchange", route);
function route() {
  if ($("appView").hidden) return;
  const h = location.hash.slice(1) || "dashboard";
  const [view, id] = h.split("/");
  document.querySelectorAll("#nav a").forEach(a => a.setAttribute("aria-current", a.getAttribute("href") === "#" + (view === "lien" ? "liens" : view) ? "page" : "false"));
  if (view === "receivables") renderReceivables();
  else if (view === "jobs") renderJobs();
  else if (view === "customers") renderCustomers();
  else if (view === "liens") renderLiens();
  else if (view === "lien" && id) renderLien(id);
  else renderDashboard();
  window.scrollTo(0, 0);
}

// ---------------- dashboard ----------------
function renderDashboard() {
  const open = S.jobs.filter(j => j.status === "estimate" || j.status === "in_progress").length;
  const unpaid = S.jobs.filter(isUnpaid);
  const unpaidTotal = unpaid.reduce((a, j) => a + balance(j), 0);
  const overdue = S.jobs.filter(j => isOverdue(j) && !openLien(j.id));
  const deadlines = S.liens.filter(l => l.status === "open").map(l => { const c = lienData(l); const n = K.nextUp(c); return n ? { l, c, n, st: K.status(c, n) } : null; }).filter(Boolean).sort((a, b) => a.n.date - b.n.date);
  const soon = deadlines.filter(d => K.daysFrom(d.n.date) <= 14).length;
  $("main").innerHTML = `
    <div class="pagehead"><div><div class="eyebrow">${esc(S.account.name)} · ${esc(K.fmt(K.TODAY))}</div><h1>Shop dashboard</h1></div>
      <button class="btn primary" data-act="new-job" type="button">New job</button></div>
    <div class="tiles">
      <div class="tile"><div class="n">${open}</div><div class="l">Open jobs</div></div>
      <a class="tile" href="#receivables"><div class="n">${esc(K.money(unpaidTotal) || "$0.00")}</div><div class="l">Owed on ${unpaid.length} job${unpaid.length === 1 ? "" : "s"} →</div></a>
      <div class="tile ${overdue.length ? "alert" : ""}"><div class="n">${overdue.length}</div><div class="l">Unpaid 30+ days, no lien case yet</div></div>
      <div class="tile ${soon ? "alert" : ""}"><div class="n">${soon}</div><div class="l">Lien deadlines in the next 14 days</div></div>
    </div>
    <section><h2>Unpaid 30+ days</h2><div class="list">${overdue.length ? overdue.map(j => `
      <div class="row" data-job="${j.id}"><div><div class="t">${esc(jobLabel(j))}</div><div class="s">${esc(cust(j.customer_id)?.name || "No customer")} · ${esc(K.money(balance(j)))} owed · ${ageDays(j)} days</div></div>
      <div class="r"><button class="btn primary" type="button" data-act="start-lien" data-id="${j.id}">Start lien case</button></div></div>`).join("") : `<div class="empty">Nobody is 30+ days late. Jobs marked Done or Invoiced with a balance show up here after 30 days.</div>`}</div></section>
    <section><h2>Lien deadlines</h2><div class="list">${deadlines.length ? deadlines.slice(0, 8).map(d => `
      <a class="row" href="#lien/${d.l.id}" style="text-decoration:none;color:inherit"><div><div class="t">${esc(d.n.title)}</div><div class="s">${esc(lienLabel(d.l))}</div></div>
      <div class="r"><span class="date">${esc(K.fmt(d.n.date))}</span><span class="chip ${d.st.cls}">${esc(d.st.txt)}</span></div></a>`).join("") : `<div class="empty">No open lien cases.</div>`}</div></section>
    <section><h2>Recent jobs</h2>${jobRows(S.jobs.slice(0, 6))}</section>`;
}
function jobRows(list) {
  if (!list.length) return `<div class="list"><div class="empty">No jobs yet. Add your first with New job.</div></div>`;
  return `<div class="list">${list.map(j => `<div class="row" data-job="${j.id}" role="button" tabindex="0">
    <div><div class="t">${esc(jobLabel(j))}</div><div class="s">${esc(cust(j.customer_id)?.name || "No customer")}${j.vehicle?.vin ? " · " + esc(j.vehicle.vin) : ""}</div></div>
    <div class="r"><span class="num">${esc(K.money(j.amount) || "—")}</span>${statusChip(j)}</div></div>`).join("")}</div>`;
}


// ---------------- receivables (AR) ----------------
const BUCKETS = [
  { key: "b0", label: "0–30 days", test: d => d <= 30, color: "var(--good)" },
  { key: "b30", label: "31–60 days", test: d => d > 30 && d <= 60, color: "var(--stone)" },
  { key: "b60", label: "61–90 days", test: d => d > 60 && d <= 90, color: "var(--amber)" },
  { key: "b90", label: "90+ days", test: d => d > 90, color: "var(--rust)" }
];
let arBucket = "all";
function renderReceivables() {
  const open = S.jobs.filter(isUnpaid).map(j => ({ j, age: ageDays(j) ?? 0, bal: balance(j) })).sort((a, b) => b.age - a.age);
  const total = open.reduce((a, x) => a + x.bal, 0);
  const sums = BUCKETS.map(b => { const xs = open.filter(x => b.test(x.age)); return { ...b, n: xs.length, amt: xs.reduce((a, x) => a + x.bal, 0) }; });
  const shown = arBucket === "all" ? open : open.filter(x => BUCKETS.find(b => b.key === arBucket).test(x.age));
  $("main").innerHTML = `
    <div class="pagehead"><div><div class="eyebrow">Accounts receivable</div><h1>Money owed: ${esc(K.money(total) || "$0.00")}</h1></div>
      <button class="btn primary" data-act="new-job" type="button">New job</button></div>
    <div class="agebar" aria-hidden="true">${total ? sums.map(b => `<span style="width:${(b.amt / total * 100).toFixed(2)}%;background:${b.color}"></span>`).join("") : ""}</div>
    <div class="aging">${sums.map(b => `<button class="bucket ${b.key}" type="button" data-bucket="${b.key}" aria-pressed="${arBucket === b.key}"><div class="k">${b.label}</div><div class="n">${esc(K.money(b.amt) || "$0.00")}</div><div class="c">${b.n} job${b.n === 1 ? "" : "s"}</div></button>`).join("")}</div>
    <div class="filters"><button class="btn sm" type="button" data-bucket="all" aria-pressed="${arBucket === "all"}">Show all ${open.length}</button></div>
    <div class="list">${shown.length ? shown.map(({ j, age, bal }) => { const c = cust(j.customer_id); const lien = openLien(j.id);
      return `<div class="row" data-job="${j.id}" role="button" tabindex="0"><div><div class="t">${esc(c?.name || "No customer")} · ${esc(jobLabel(j))}</div>
        <div class="s">${esc(K.money(bal))} owed of ${esc(K.money(j.amount) || "—")} · ${age} days since ${j.invoiced_on ? "invoice" : "work done"}${c?.phone ? " · " + esc(c.phone) : ""}</div></div>
        <div class="r"><div class="acts">
          <button class="btn sm" type="button" data-act="remind" data-id="${j.id}">Reminder</button>
          <button class="btn sm" type="button" data-act="pay" data-id="${j.id}">Record payment</button>
          ${lien ? `<a class="btn sm" href="#lien/${lien.id}">Lien case</a>` : age >= 30 ? `<button class="btn sm primary" type="button" data-act="start-lien" data-id="${j.id}">Start lien</button>` : ""}
        </div></div></div>`; }).join("") : `<div class="empty">${open.length ? "Nothing in this group." : "Nobody owes the shop money right now. Jobs marked Done or Invoiced with a balance show up here."}</div>`}</div>`;
}
function payModal(j) {
  openModal(`<form id="payForm"><div style="display:grid;gap:16px"><h2>Record a payment</h2>
    <div class="small">${esc(cust(j.customer_id)?.name || "No customer")} · ${esc(jobLabel(j))} · ${esc(K.money(balance(j)))} still owed</div>
    <div class="grid"><div class="field"><label for="pAmt">Amount paid ($)</label><input id="pAmt" inputmode="decimal" value="${esc(balance(j).toFixed(2))}"></div>
      <div class="field"><label for="pDate">Date</label><input id="pDate" type="date" value="${K.iso(K.TODAY)}"></div></div>
    <div class="msg" id="payMsg"></div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save payment</button></div></div></form>`);
  $("payForm").addEventListener("submit", async e => {
    e.preventDefault();
    const amt = +$("pAmt").value.replace(/[$,\s]/g, "");
    if (!(amt > 0)) { $("payMsg").className = "msg err"; $("payMsg").textContent = "Enter the amount paid."; return; }
    const paid = Math.round(((+j.amount_paid || 0) + amt) * 100) / 100;
    const full = j.amount != null && paid >= +j.amount;
    const row = { amount_paid: paid, ...(full ? { status: "paid", paid_on: $("pDate").value || K.iso(K.TODAY) } : {}) };
    const { data, error } = await sb.from("shop_jobs").update(row).eq("id", j.id).select().single();
    if (error) { $("payMsg").className = "msg err"; $("payMsg").textContent = error.message; return; }
    Object.assign(j, data);
    let closed = 0;
    if (full) for (const l of S.liens.filter(l => l.job_id === j.id && l.status === "open")) { const { error: e2 } = await sb.from("shop_liens").update({ status: "closed" }).eq("id", l.id); if (!e2) { l.status = "closed"; closed++; } }
    closeModal(); route();
    toast(full ? (closed ? "Paid in full. Lien case closed. Send the release from the case." : "Paid in full.") : `Payment saved. ${K.money(balance(j))} still owed.`);
  });
}
function reminderText(j) {
  const c = cust(j.customer_id) || {}; const age = ageDays(j) ?? 0; const who = (c.name || "").split(" ")[0] || "there";
  const what = jobLabel(j), amt = K.money(balance(j)), shop = S.account.name, phone = S.account.phone;
  if (age <= 30) return `Hi ${who}, this is ${shop}. Just a friendly reminder that ${amt} is still open for your ${what}. You can pay at the shop or call us at ${phone}. Thank you!`;
  if (age <= 60) return `Hi ${who}, ${shop} here. Your balance of ${amt} for the ${what} is now ${age} days past due. Please call ${phone} this week to pay or set up a plan.`;
  return `Hi ${who}, this is ${shop}. The ${amt} balance for your ${what} is ${age} days past due. If we can't settle this soon, we will have to begin the Kansas lien process on the vehicle. Please call ${phone} right away so we can work it out.`;
}
function remindModal(j) {
  const c = cust(j.customer_id) || {}; const text = reminderText(j);
  const sms = c.phone ? `sms:${c.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}` : "";
  const mail = c.email ? `mailto:${c.email}?subject=${encodeURIComponent("Balance due — " + S.account.name)}&body=${encodeURIComponent(text)}` : "";
  openModal(`<div style="display:grid;gap:16px"><h2>Payment reminder</h2>
    <div class="small">${esc(c.name || "No customer")}${c.phone ? " · " + esc(c.phone) : ""}${c.email ? " · " + esc(c.email) : ""}</div>
    <textarea class="copybox" id="remText">${esc(text)}</textarea>
    <div class="small">Edit it if you want, then copy it into a text or email.${!c.phone && !c.email ? " Add the customer's phone or email to text or email it from here." : ""}</div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Close</button>
      ${mail ? `<a class="btn" href="${esc(mail)}">Email it</a>` : ""}${sms ? `<a class="btn" href="${esc(sms)}">Text it</a>` : ""}
      <button class="btn primary" type="button" data-act="copy-rem">Copy</button></div></div>`);
}

// ---------------- jobs ----------------
let jobFilter = "all";
function renderJobs() {
  const F = { all: () => true, open: j => j.status === "estimate" || j.status === "in_progress", unpaid: isUnpaid, overdue: isOverdue, paid: j => j.status === "paid" };
  const labels = { all: "All", open: "Open", unpaid: "Unpaid", overdue: "30+ days unpaid", paid: "Paid" };
  $("main").innerHTML = `
    <div class="pagehead"><h1>Jobs</h1><button class="btn primary" data-act="new-job" type="button">New job</button></div>
    <div class="filters">${Object.keys(F).map(k => `<button class="btn" type="button" data-filter="${k}" aria-pressed="${k === jobFilter}">${labels[k]}</button>`).join("")}</div>
    ${jobRows(S.jobs.filter(F[jobFilter]))}`;
}

// ---------------- customers ----------------
function renderCustomers() {
  $("main").innerHTML = `
    <div class="pagehead"><h1>Customers</h1><button class="btn primary" data-act="new-customer" type="button">New customer</button></div>
    <div class="list">${S.customers.length ? S.customers.map(c => {
      const js = S.jobs.filter(j => j.customer_id === c.id); const owed = js.filter(isUnpaid).reduce((a, j) => a + balance(j), 0);
      return `<div class="row" data-customer="${c.id}" role="button" tabindex="0"><div><div class="t">${esc(c.name)}</div><div class="s">${esc([c.phone, c.email].filter(Boolean).join(" · ") || "No contact info")}</div></div>
        <div class="r"><span class="small">${js.length} job${js.length === 1 ? "" : "s"}</span>${owed ? `<span class="chip soon">${esc(K.money(owed))} owed</span>` : ""}</div></div>`;
    }).join("") : `<div class="empty">No customers yet.</div>`}</div>`;
}

// ---------------- liens ----------------
let lienFilter = "open";
function renderLiens() {
  const list = S.liens.filter(l => l.status === lienFilter);
  $("main").innerHTML = `
    <div class="pagehead"><div><h1>Lien cases</h1><div class="small">Start one from any unpaid job, or from the dashboard.</div></div></div>
    <div class="filters"><button class="btn" type="button" data-lfilter="open" aria-pressed="${lienFilter === "open"}">Open</button><button class="btn" type="button" data-lfilter="closed" aria-pressed="${lienFilter === "closed"}">Closed</button></div>
    <div class="list">${list.length ? list.map(l => { const c = lienData(l); const n = K.nextUp(c); const st = n ? K.status(c, n) : null;
      return `<a class="row" href="#lien/${l.id}" style="text-decoration:none;color:inherit"><div><div class="t">${esc(lienLabel(l))}</div><div class="s">${esc(K.TRACKS[l.track].label)} · ${esc(K.money(c.amount) || "—")}${n ? " · Next: " + esc(n.title) : ""}</div></div>
        <div class="r">${n ? `<span class="date">${esc(K.fmt(n.date))}</span><span class="chip ${st.cls}">${esc(st.txt)}</span>` : `<span class="chip wait">Add dates</span>`}</div></a>`; }).join("") : `<div class="empty">No ${lienFilter} lien cases.</div>`}</div>`;
}

let currentLien = null, currentDoc = null, saveT = null;
function renderLien(id) {
  const l = S.liens.find(x => x.id === id);
  if (!l) { $("main").innerHTML = `<div class="empty">That lien case wasn't found. <a href="#liens">Back to lien cases</a></div>`; return; }
  currentLien = l; const c = lienData(l);
  const veh = c.track === "repair" || c.track === "tow";
  $("main").innerHTML = `
    <div><a href="#liens" class="small">← Lien cases</a></div>
    <div class="head"><div><div class="eyebrow">${esc(K.TRACKS[c.track].label)} · ${esc(K.TRACKS[c.track].law)}${l.status === "closed" ? " · CLOSED" : ""}</div>
      <h1 id="lienTitle">${esc(lienLabel(l))}</h1><div class="small">Owed to ${esc(c.claimant.name || S.account.name)}</div></div>
      <div class="amount"><div class="l">Amount owed</div><div class="n" id="lienAmt">${esc(K.money(c.amount) || "—")}</div></div></div>
    <div class="banner" id="banner"></div>
    <div class="cols">
      <section><h2>Deadlines</h2><ul class="steps" id="steps"></ul></section>
      <section><h2>Paperwork</h2><div class="docs" id="docs"></div><div class="sheet" id="sheet" tabindex="0" aria-label="Document preview"></div>
        <div class="sheetbar"><button class="btn" type="button" data-act="copy-doc">Copy text</button><span class="small" id="missing"></span></div></section>
    </div>
    <details class="panel" open><summary>Case facts</summary><div class="grid" id="facts">${factsForm(c, veh)}</div></details>
    <div style="display:flex;gap:8px;flex-wrap:wrap" id="lienActions">
      ${l.job_id ? `<button class="btn" type="button" data-job="${l.job_id}">Open the job</button>` : ""}
      <button class="btn" type="button" data-act="toggle-lien">${l.status === "open" ? "Close case (paid or done)" : "Reopen case"}</button>
      <button class="btn danger" type="button" data-act="del-lien">Delete case</button></div>`;
  renderLienParts();
}
function field(c, path, label, opts = {}) {
  const id = "lf-" + path.replace(/\./g, "-"); const val = get(c, path) ?? "";
  if (opts.type === "check") return `<div class="field check"><input type="checkbox" id="${id}" data-path="${path}" ${val ? "checked" : ""}><label for="${id}">${esc(label)}</label></div>`;
  if (opts.type === "textarea") return `<div class="field wide"><label for="${id}">${esc(label)}</label><textarea id="${id}" data-path="${path}" rows="2">${esc(val)}</textarea></div>`;
  return `<div class="field ${opts.wide ? "wide" : ""}"><label for="${id}">${esc(label)}</label><input id="${id}" data-path="${path}" type="${opts.type || "text"}" value="${esc(val)}"></div>`;
}
function factsForm(c, veh) {
  let h = `<div class="grouplabel">Who's owed</div>${field(c, "claimant.name", "Business name")}${field(c, "claimant.phone", "Phone")}${field(c, "claimant.address", "Business address", { wide: true })}
    <div class="grouplabel">${veh ? "Owner" : "Property owner"}</div>${field(c, "owner.name", "Owner name")}${field(c, "owner.address", "Owner address")}
    ${c.track === "sub" ? field(c, "contractor.name", "General contractor") + field(c, "contractor.address", "Contractor address") : ""}
    <div class="grouplabel">${veh ? "Vehicle or equipment" : "Property"} and money</div>`;
  if (veh) h += field(c, "vehicle.year", "Year") + field(c, "vehicle.make", "Make") + field(c, "vehicle.model", "Model") + field(c, "vehicle.vin", "VIN or serial") + field(c, "vehicle.plate", "Plate");
  else h += field(c, "property.address", "Property address", { wide: true }) + field(c, "property.county", "County") + field(c, "property.legal", "Legal description") + field(c, "residential", "Residential property", { type: "check" }) + (c.residential ? field(c, "newResidential", "New home construction", { type: "check" }) : "");
  h += field(c, "amount", "Amount owed ($)") + field(c, "description", "What the work was", { type: "textarea" }) + `<div class="grouplabel">Key dates</div>`;
  if (c.track === "repair") h += field(c, "dates.lastWork", "Work completed", { type: "date" }) + field(c, "dates.released", "Given back to owner (blank if you still have it)", { type: "date" }) + field(c, "dates.noticeMailed", "Notice of sale mailed", { type: "date" }) + field(c, "dates.saleDate", "Sale date", { type: "date" }) + field(c, "saleTime", "Sale time") + field(c, "dates.filed", "Lien filed with register of deeds", { type: "date" });
  if (c.track === "tow") h += field(c, "dates.possession", "Took possession", { type: "date" }) + field(c, "dates.verification", "DMV verification received", { type: "date" }) + field(c, "dates.noticeMailed", "Notice of sale mailed", { type: "date" }) + field(c, "dates.saleDate", "Auction date", { type: "date" }) + field(c, "saleTime", "Auction time");
  if (c.track === "gc" || c.track === "sub") h += field(c, "dates.lastWork", "Last day you furnished labor or materials", { type: "date" }) + field(c, "dates.filed", "Lien statement filed", { type: "date" });
  return h;
}
function renderLienParts() {
  const l = currentLien; const c = lienData(l);
  const steps = K.steps(c);
  $("steps").innerHTML = steps.map(s => { const st = K.status(c, s);
    const box = s.kind === "info" ? `<span aria-hidden="true"></span>` : `<input type="checkbox" data-step="${s.key}" aria-label="Mark done: ${esc(s.title)}" ${c.done[s.key] ? "checked" : ""}>`;
    return `<li class="step ${c.done[s.key] ? "isdone" : ""}">${box}<div><div class="t">${esc(s.title)}</div><div class="d">${esc(s.detail)}</div>${s.cite ? `<span class="cite">${esc(s.cite)}</span>` : ""}</div>
      <div class="when">${s.kind === "info" ? "" : `<span class="date">${s.kind === "after" ? "not before " : ""}${esc(K.fmt(s.date))}</span>`}<span class="chip ${st.cls}">${esc(st.txt)}</span></div></li>`; }).join("");
  const n = K.nextUp(c), b = $("banner");
  if (!n) { b.className = "banner"; b.innerHTML = `<b>Nothing due yet.</b> <span>Add the key dates under Case facts to build the deadline calendar.</span>`; }
  else { const st = K.status(c, n); b.className = "banner " + (st.cls === "over" ? "over" : st.cls === "soon" ? "soon" : "ok");
    b.innerHTML = `<b>Next: ${esc(n.title)}</b><span class="date">${esc(K.fmt(n.date))}</span><span class="chip ${st.cls}">${esc(st.txt)}</span>`; }
  const docs = K.docsFor(c); if (!docs.some(d => d.key === currentDoc)) currentDoc = docs[0].key;
  $("docs").innerHTML = docs.map(d => `<button class="btn docbtn" type="button" data-doc="${d.key}" aria-pressed="${d.key === currentDoc}">${esc(d.label)}</button>`).join("");
  const text = K.renderDoc(c, currentDoc);
  $("sheet").innerHTML = esc(text).replace(/⟦(.*?)⟧/g, '<span class="ph">[$1]</span>');
  const missing = (text.match(/⟦/g) || []).length;
  $("missing").textContent = missing ? `${missing} blank${missing > 1 ? "s" : ""} to fill (highlighted). Add them under Case facts.` : "All fields filled.";
}
function queueLienSave() {
  clearTimeout(saveT);
  const l = currentLien;
  saveT = setTimeout(async () => {
    const data = { ...l.data }; delete data.track;
    const { error } = await sb.from("shop_liens").update({ data }).eq("id", l.id);
    if (error) fail(error, "Saving");
  }, 500);
}

// ---------------- modals ----------------
function openModal(html) { $("modal").innerHTML = html; $("overlay").hidden = false; const f = $("modal").querySelector("input,select,textarea,button"); f && f.focus(); }
function closeModal() { $("overlay").hidden = true; $("modal").innerHTML = ""; }
$("overlay").addEventListener("click", e => { if (e.target.id === "overlay") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("overlay").hidden) closeModal(); });

function jobModal(j) {
  const isNew = !j; j = j || { kind: S.account.industry === "contractor" || S.account.industry === "subcontractor" ? "property" : "vehicle", status: "in_progress", vehicle: {}, property: {}, amount_paid: 0 };
  const v = j.vehicle || {}, p = j.property || {};
  const lien = !isNew && openLien(j.id);
  openModal(`<form id="jobForm"><div style="display:grid;gap:16px">
    <h2>${isNew ? "New job" : "Edit job"}</h2>
    <div class="grid">
      <div class="field wide"><label for="jCust">Customer</label><select id="jCust"><option value="">— Pick a customer —</option>${S.customers.map(c => `<option value="${c.id}" ${c.id === j.customer_id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}<option value="__new">+ New customer…</option></select></div>
      <div class="field" data-newcust hidden><label for="jcName">New customer name</label><input id="jcName"></div>
      <div class="field" data-newcust hidden><label for="jcPhone">Phone</label><input id="jcPhone" type="tel"></div>
      <div class="field wide" data-newcust hidden><label for="jcAddr">Address</label><input id="jcAddr"></div>
      <div class="field"><label for="jKind">Job is on a…</label><select id="jKind"><option value="vehicle" ${j.kind === "vehicle" ? "selected" : ""}>Vehicle</option><option value="equipment" ${j.kind === "equipment" ? "selected" : ""}>Equipment / machinery</option><option value="property" ${j.kind === "property" ? "selected" : ""}>Building / real estate</option></select></div>
      <div class="field"><label for="jTitle">Job title</label><input id="jTitle" value="${esc(j.title || "")}" placeholder="e.g. Transmission rebuild"></div>
      <div class="field" data-veh><label for="jYear">Year</label><input id="jYear" value="${esc(v.year || "")}" inputmode="numeric"></div>
      <div class="field" data-veh><label for="jMake">Make</label><input id="jMake" value="${esc(v.make || "")}"></div>
      <div class="field" data-veh><label for="jModel">Model</label><input id="jModel" value="${esc(v.model || "")}"></div>
      <div class="field" data-veh><label for="jVin">VIN or serial</label><input id="jVin" value="${esc(v.vin || "")}"></div>
      <div class="field" data-veh><label for="jPlate">Plate</label><input id="jPlate" value="${esc(v.plate || "")}"></div>
      <div class="field wide" data-prop><label for="jAddr">Property address</label><input id="jAddr" value="${esc(p.address || "")}"></div>
      <div class="field" data-prop><label for="jCounty">County</label><input id="jCounty" value="${esc(p.county || "")}"></div>
      <div class="field check" data-prop><input type="checkbox" id="jRes" ${p.residential ? "checked" : ""}><label for="jRes">Residential</label></div>
      <div class="field wide"><label for="jDesc">Work description</label><textarea id="jDesc" rows="2">${esc(j.description || "")}</textarea></div>
      <div class="field"><label for="jStatus">Status</label><select id="jStatus">${Object.entries(STATUS).map(([k, t]) => `<option value="${k}" ${k === j.status ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="field"><label for="jAmt">Total ($)</label><input id="jAmt" inputmode="decimal" value="${esc(j.amount ?? "")}"></div>
      <div class="field"><label for="jPaid">Paid so far ($)</label><input id="jPaid" inputmode="decimal" value="${esc(j.amount_paid ?? 0)}"></div>
      <div class="field"><label for="jDone">Work completed</label><input id="jDone" type="date" value="${esc(j.completed_on || "")}"></div>
      <div class="field"><label for="jInv">Invoiced</label><input id="jInv" type="date" value="${esc(j.invoiced_on || "")}"></div>
      <div class="field"><label for="jPaidOn">Paid in full on</label><input id="jPaidOn" type="date" value="${esc(j.paid_on || "")}"></div>
    </div>
    <div class="msg" id="jobMsg" aria-live="polite"></div>
    <div class="modalfoot" id="jobFoot">
      ${!isNew ? `<button class="btn danger" type="button" data-act="del-job" data-id="${j.id}" style="margin-right:auto">Delete</button>` : ""}
      ${!isNew && lien ? `<a class="btn" href="#lien/${lien.id}" data-act="close">Open lien case</a>` : ""}
      ${!isNew && !lien && isUnpaid(j) ? `<button class="btn" type="button" data-act="start-lien" data-id="${j.id}">Start lien case</button>` : ""}
      <button class="btn ghost" type="button" data-act="close">Cancel</button>
      <button class="btn primary" type="submit">Save job</button>
    </div></div></form>`);
  const sync = () => {
    const k = $("jKind").value;
    $("modal").querySelectorAll("[data-veh]").forEach(e => e.hidden = k === "property");
    $("modal").querySelectorAll("[data-prop]").forEach(e => e.hidden = k !== "property");
    $("modal").querySelectorAll("[data-newcust]").forEach(e => e.hidden = $("jCust").value !== "__new");
  };
  $("jKind").addEventListener("change", sync); $("jCust").addEventListener("change", sync); sync();
  $("jStatus").addEventListener("change", () => { if ($("jStatus").value === "paid" && !$("jPaidOn").value) { $("jPaidOn").value = K.iso(K.TODAY); $("jPaid").value = $("jAmt").value || $("jPaid").value; } });
  $("jobForm").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("jobMsg");
    let customer_id = $("jCust").value || null;
    try {
      if (customer_id === "__new") {
        const name = $("jcName").value.trim(); if (!name) { msg.className = "msg err"; msg.textContent = "Enter the new customer's name."; return; }
        const { data, error } = await sb.from("shop_customers").insert({ account_id: S.account.id, name, phone: $("jcPhone").value.trim(), address: $("jcAddr").value.trim() }).select().single();
        if (error) throw error; S.customers.push(data); S.customers.sort((a, b) => a.name.localeCompare(b.name)); customer_id = data.id;
      }
      const kind = $("jKind").value;
      const amt = $("jAmt").value.replace(/[$,\s]/g, ""), paid = $("jPaid").value.replace(/[$,\s]/g, "");
      const row = { account_id: S.account.id, customer_id, kind, title: $("jTitle").value.trim(), description: $("jDesc").value.trim(),
        vehicle: kind === "property" ? {} : { year: $("jYear").value.trim(), make: $("jMake").value.trim(), model: $("jModel").value.trim(), vin: $("jVin").value.trim().toUpperCase(), plate: $("jPlate").value.trim() },
        property: kind === "property" ? { address: $("jAddr").value.trim(), county: $("jCounty").value.trim(), residential: $("jRes").checked } : {},
        status: $("jStatus").value, amount: amt === "" || isNaN(+amt) ? null : +amt, amount_paid: paid === "" || isNaN(+paid) ? 0 : +paid,
        completed_on: nul($("jDone").value), invoiced_on: nul($("jInv").value), paid_on: nul($("jPaidOn").value) };
      if (row.status === "paid" && row.amount != null && row.amount_paid < row.amount) row.amount_paid = row.amount;
      const q = isNew ? sb.from("shop_jobs").insert(row).select().single() : sb.from("shop_jobs").update(row).eq("id", j.id).select().single();
      const { data, error } = await q; if (error) throw error;
      if (isNew) S.jobs.unshift(data); else Object.assign(j, data);
      if (data.status === "paid") {
        const open = S.liens.filter(l => l.job_id === data.id && l.status === "open");
        for (const l of open) { const { error: e2 } = await sb.from("shop_liens").update({ status: "closed" }).eq("id", l.id); if (!e2) l.status = "closed"; }
        if (open.length) toast("Marked paid. Lien case closed. Send the release from the closed case.");
        else toast("Job saved.");
      } else toast("Job saved.");
      closeModal(); route();
    } catch (err) { msg.className = "msg err"; msg.textContent = err.message || "Couldn't save. Try again."; }
  });
}

function customerModal(c) {
  const isNew = !c; c = c || {};
  openModal(`<form id="custForm"><div style="display:grid;gap:16px"><h2>${isNew ? "New customer" : "Edit customer"}</h2>
    <div class="grid">
      <div class="field"><label for="cName">Name</label><input id="cName" value="${esc(c.name || "")}" required></div>
      <div class="field"><label for="cPhone">Phone</label><input id="cPhone" type="tel" value="${esc(c.phone || "")}"></div>
      <div class="field"><label for="cEmail">Email</label><input id="cEmail" type="email" value="${esc(c.email || "")}"></div>
      <div class="field wide"><label for="cAddr">Mailing address (used on certified letters)</label><input id="cAddr" value="${esc(c.address || "")}"></div>
      <div class="field wide"><label for="cNotes">Notes</label><textarea id="cNotes" rows="2">${esc(c.notes || "")}</textarea></div>
    </div>
    ${!isNew ? `<div><h2>Jobs</h2>${jobRows(S.jobs.filter(j => j.customer_id === c.id))}</div>` : ""}
    <div class="msg" id="custMsg"></div>
    <div class="modalfoot">${!isNew ? `<button class="btn danger" type="button" data-act="del-customer" data-id="${c.id}" style="margin-right:auto">Delete</button>` : ""}
      <button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="submit">Save customer</button></div></div></form>`);
  $("custForm").addEventListener("submit", async e => {
    e.preventDefault();
    const row = { account_id: S.account.id, name: $("cName").value.trim(), phone: $("cPhone").value.trim(), email: $("cEmail").value.trim(), address: $("cAddr").value.trim(), notes: $("cNotes").value.trim() };
    if (!row.name) { $("custMsg").className = "msg err"; $("custMsg").textContent = "Name is required."; return; }
    const q = isNew ? sb.from("shop_customers").insert(row).select().single() : sb.from("shop_customers").update(row).eq("id", c.id).select().single();
    const { data, error } = await q;
    if (error) { $("custMsg").className = "msg err"; $("custMsg").textContent = error.message; return; }
    if (isNew) S.customers.push(data); else Object.assign(c, data);
    S.customers.sort((a, b) => a.name.localeCompare(b.name));
    toast("Customer saved."); closeModal(); route();
  });
}

function startLienModal(j) {
  const ind = S.account.industry;
  const def = j.kind === "property" ? (ind === "subcontractor" ? "sub" : "gc") : (ind === "towing" ? "tow" : "repair");
  openModal(`<div style="display:grid;gap:16px"><h2>Start a lien case</h2>
    <div class="small">${esc(jobLabel(j))} · ${esc(cust(j.customer_id)?.name || "No customer")} · ${esc(K.money(balance(j)))} owed</div>
    <div class="field"><label for="lTrack">Which Kansas lien?</label><select id="lTrack">${Object.entries(K.TRACKS).map(([k, t]) => `<option value="${k}" ${k === def ? "selected" : ""}>${esc(t.label)} — ${esc(t.blurb)}</option>`).join("")}</select></div>
    <div class="small">Everything we know from the job and customer is filled in. You'll check it on the next screen.</div>
    <div class="msg" id="lienMsg"></div>
    <div class="modalfoot"><button class="btn ghost" type="button" data-act="close">Cancel</button><button class="btn primary" type="button" data-act="create-lien" data-id="${j.id}">Start case</button></div></div>`);
}
async function createLien(j, track) {
  const c = cust(j.customer_id) || {};
  const data = {
    claimant: { name: S.account.name, address: S.account.address, phone: S.account.phone },
    owner: { name: c.name || "", address: c.address || "" }, contractor: {},
    vehicle: j.kind === "property" ? {} : { ...(j.vehicle || {}) },
    property: j.kind === "property" ? { address: j.property?.address || "", county: j.property?.county || "", legal: "" } : {},
    residential: !!j.property?.residential, newResidential: false,
    amount: String(balance(j)), description: j.description || j.title || "",
    dates: { lastWork: j.completed_on || "", ...(track === "tow" ? { possession: j.completed_on || "" } : {}) },
    saleTime: "", done: {}
  };
  const { data: row, error } = await sb.from("shop_liens").insert({ account_id: S.account.id, job_id: j.id, track, data }).select().single();
  if (error) throw error;
  S.liens.unshift(row);
  closeModal(); location.hash = "lien/" + row.id;
}

// ---------------- global events ----------------
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-act],[data-bucket],[data-job],[data-customer],[data-filter],[data-lfilter],[data-doc],[data-step]");
  if (!t || $("appView").hidden) return;
  if (t.dataset.step) return; // handled on change
  const act = t.dataset.act;
  if (act === "close") { closeModal(); return; }
  if (act === "new-job") { jobModal(null); return; }
  if (act === "new-customer") { customerModal(null); return; }
  if (act === "pay") { e.stopPropagation(); const j = S.jobs.find(x => x.id === t.dataset.id); if (j) payModal(j); return; }
  if (act === "remind") { e.stopPropagation(); const j = S.jobs.find(x => x.id === t.dataset.id); if (j) remindModal(j); return; }
  if (act === "copy-rem") { const v = $("remText").value; try { await navigator.clipboard.writeText(v); toast("Copied."); } catch { $("remText").select(); toast("Selected. Press Ctrl+C or ⌘C."); } return; }
  if (act === "start-lien") { e.stopPropagation(); const j = S.jobs.find(x => x.id === t.dataset.id); if (j) startLienModal(j); return; }
  if (act === "create-lien") { const j = S.jobs.find(x => x.id === t.dataset.id); t.disabled = true; try { await createLien(j, $("lTrack").value); } catch (err) { $("lienMsg").className = "msg err"; $("lienMsg").textContent = err.message; t.disabled = false; } return; }
  if (act === "del-job") { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; return; }
    const { error } = await sb.from("shop_jobs").delete().eq("id", t.dataset.id); if (error) return fail(error, "Deleting");
    S.jobs = S.jobs.filter(j => j.id !== t.dataset.id); S.liens.forEach(l => { if (l.job_id === t.dataset.id) l.job_id = null; }); closeModal(); toast("Job deleted."); route(); return; }
  if (act === "del-customer") { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; return; }
    const { error } = await sb.from("shop_customers").delete().eq("id", t.dataset.id); if (error) return fail(error, "Deleting");
    S.customers = S.customers.filter(c => c.id !== t.dataset.id); S.jobs.forEach(j => { if (j.customer_id === t.dataset.id) j.customer_id = null; }); closeModal(); toast("Customer deleted."); route(); return; }
  if (act === "copy-doc") { const text = K.renderDoc(lienData(currentLien), currentDoc).replace(/⟦(.*?)⟧/g, "[$1]");
    try { await navigator.clipboard.writeText(text); toast("Copied. Paste it into a document to print and sign."); } catch { const r = document.createRange(); r.selectNodeContents($("sheet")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Text selected. Press Ctrl+C or ⌘C."); } return; }
  if (act === "toggle-lien") { const l = currentLien; const status = l.status === "open" ? "closed" : "open";
    const { error } = await sb.from("shop_liens").update({ status }).eq("id", l.id); if (error) return fail(error, "Saving"); l.status = status; renderLien(l.id); toast(status === "closed" ? "Case closed." : "Case reopened."); return; }
  if (act === "del-lien") { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; return; }
    const { error } = await sb.from("shop_liens").delete().eq("id", currentLien.id); if (error) return fail(error, "Deleting");
    S.liens = S.liens.filter(l => l.id !== currentLien.id); location.hash = "liens"; toast("Lien case deleted."); return; }
  if (t.dataset.bucket) { arBucket = t.dataset.bucket; renderReceivables(); return; }
  if (t.dataset.doc) { currentDoc = t.dataset.doc; renderLienParts(); return; }
  if (t.dataset.filter) { jobFilter = t.dataset.filter; renderJobs(); return; }
  if (t.dataset.lfilter) { lienFilter = t.dataset.lfilter; renderLiens(); return; }
  if (t.dataset.job) { const j = S.jobs.find(x => x.id === t.dataset.job); if (j) jobModal(j); return; }
  if (t.dataset.customer) { const c = S.customers.find(x => x.id === t.dataset.customer); if (c) customerModal(c); return; }
});
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".row[role=button]")) { e.preventDefault(); e.target.click(); } });
document.addEventListener("change", e => {
  if (!currentLien || !$("main").contains(e.target)) return;
  const t = e.target; const l = currentLien; const c = K.norm(l.data || (l.data = {}));
  if (t.dataset.step) { c.done[t.dataset.step] = t.checked; queueLienSave(); renderLienParts(); return; }
  if (t.dataset.path) {
    setp(c, t.dataset.path, t.type === "checkbox" ? t.checked : t.value.trim());
    queueLienSave();
    if (t.dataset.path === "residential") { if (!t.checked) c.newResidential = false; renderLien(l.id); return; }
    renderLienParts(); $("lienTitle").textContent = lienLabel(l); $("lienAmt").textContent = K.money(c.amount) || "—";
  }
});

// ---------------- start ----------------
sb.auth.onAuthStateChange((ev, session) => { setTimeout(() => { if (ev === "PASSWORD_RECOVERY") return showReset(); if (!recovering) boot(session); }, 0); });
sb.auth.getSession().then(({ data }) => { if (!recovering && !/type=recovery/.test(location.hash)) boot(data.session); });
})();
