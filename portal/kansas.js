// Kansas lien rules engine + document drafts. Pure functions, no DOM.
// Not legal advice — figures summarized Nov 2026; confirm with a Kansas attorney.
(function () {
"use strict";
const TRACKS = {
  repair: { label: "Repair shop", blurb: "Unpaid repairs on a vehicle or equipment you're holding", law: "K.S.A. 58-201" },
  tow:    { label: "Tow / storage", blurb: "Towed or stored vehicle nobody claimed", law: "K.S.A. 8-1101 et seq." },
  gc:     { label: "General contractor", blurb: "You contracted with the property owner", law: "K.S.A. 60-1102" },
  sub:    { label: "Sub or supplier", blurb: "You worked for the contractor, not the owner", law: "K.S.A. 60-1103" }
};

const D = s => (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? new Date(s + "T00:00:00Z") : null;
const iso = d => d.toISOString().slice(0, 10);
const todayNow = () => { const n = new Date(); return D(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`); };
let TODAY = todayNow();
const refreshToday = () => { TODAY = todayNow(); return TODAY; };
const addDays = (d, n) => d ? new Date(d.getTime() + n * 864e5) : null;
const addMonths = (d, n) => {
  if (!d) return null;
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last)));
};
const fmt = d => d ? d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "—";
const longFmt = d => d ? d.toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }) : "";
const daysFrom = d => Math.round((d - TODAY) / 864e5);
const maxD = (...ds) => ds.filter(Boolean).sort((a, b) => b - a)[0] || null;
const money = n => (n || n === 0) && n !== "" && !isNaN(+n) ? "$" + (+n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

function norm(c) {
  c.claimant = c.claimant || {}; c.owner = c.owner || {}; c.contractor = c.contractor || {};
  c.vehicle = c.vehicle || {}; c.property = c.property || {}; c.dates = c.dates || {}; c.done = c.done || {};
  return c;
}

// kind: "due" = must happen by date; "after" = cannot happen before date; "info" = note
function steps(c) {
  norm(c);
  const d = k => D(c.dates[k]);
  const S = [];
  const add = (key, title, date, kind, detail, cite) => S.push({ key, title, date, kind, detail, cite });

  if (c.track === "gc" || c.track === "sub") {
    const months = c.track === "gc" ? 4 : 3;
    const last = d("lastWork");
    const base = addMonths(last, months);
    const canExtend = !c.residential;
    const ext = canExtend ? addMonths(last, months + 1) : null;
    const extended = canExtend && c.done.extension;
    const deadline = extended ? ext : base;
    const filed = d("filed");
    add("demand", "Send payment demand and notice of intent to lien", base ? addDays(base, -30) : null, "due",
      "Not required by statute, but often gets you paid without filing. Send it at least 30 days before the lien deadline.", "Best practice");
    if (c.track === "sub" && c.residential && !c.newResidential)
      add("warning", "Serve the warning statement on the homeowner", base, "due",
        "On existing residential property, attach an affidavit of service to the lien statement.", "K.S.A. 60-1103a");
    if (c.residential && c.newResidential)
      add("noi", "Check that a Notice of Intent to Perform was filed", null, "info",
        "New residential construction: the notice is filed with the district court clerk. Without it, sub and supplier lien rights may be lost.", "K.S.A. 60-1103b");
    if (canExtend)
      add("extension", "Optional: file a notice of extension (+1 month)", base, "due",
        `Must be filed before the original deadline. It moves the lien deadline to ${fmt(ext)}. Not available on residential property.`, "K.S.A. 60-1102 / 60-1103");
    add("file", `File the verified lien statement with the ${c.property.county ? c.property.county + " County" : "county"} district court clerk`, deadline, "due",
      `${months} months after last furnishing (${fmt(last)})${extended ? ", plus the 1-month extension" : ""}. Sign it in front of a notary.`,
      c.track === "gc" ? "K.S.A. 60-1102" : "K.S.A. 60-1103");
    if (c.track === "sub")
      add("serve", "Serve a copy of the lien statement on the owner", filed || deadline, "due",
        "Serve it right after filing and keep proof of service.", "K.S.A. 60-1103");
    add("foreclose", "Sue to foreclose, or the lien expires", addMonths(filed || deadline, 12), "due",
      filed ? `1 year from filing on ${fmt(filed)}.` : "1 year from filing. Shown from the filing deadline until you enter the date you filed.", "K.S.A. 60-1105");
    add("release", "Send a lien release once paid", null, "info", "Print it under Letters and forms.", "");
  }

  if (c.track === "repair") {
    const last = d("lastWork"), rel = d("released"), mailed = d("noticeMailed"), sale = d("saleDate"), filed = d("filed");
    add("possess", "Keep the vehicle: the lien lasts while you hold it", null, "info",
      "Your repair lien is a first lien and stays valid as long as you keep possession.", "K.S.A. 58-201");
    if (rel) {
      add("rod", "File a sworn lien statement with the register of deeds", addDays(rel, 90), "due",
        `You released it on ${fmt(rel)}. File within 90 days, in the county where the work was done and the owner's county if known.`, "K.S.A. 58-201");
      add("foreclose", "Enforce the filed lien within 1 year", filed ? addMonths(filed, 12) : null, "due",
        "Enter the date you filed to see the deadline.", "K.S.A. 58-202");
    } else {
      add("demand", "Send the customer a payment demand", last ? addDays(last, 30) : null, "due",
        "A clear demand letter recovers many accounts before any sale.", "Best practice");
      add("lookup", "Look up the registered owner and all lienholders", last ? addDays(last, 45) : null, "due",
        "Order a title and registration record from the Kansas Division of Vehicles. Every lienholder gets notice.", "K.S.A. 58-202; UCC K.S.A. 84-9-611");
      add("notice", "Mail the notice of sale by certified mail", sale ? addDays(sale, -10) : null, "due",
        sale ? "At least 10 days before the sale date." : "Pick a sale date to set this deadline. Mail it at least 10 days before the sale.",
        "UCC K.S.A. 84-9-611, 84-9-612");
      add("earliest", "Earliest sale date", mailed ? addDays(mailed, 10) : null, "after",
        mailed ? `10 days after the notice was mailed on ${fmt(mailed)}.` : "Enter the date you mailed the notice.", "K.S.A. 84-9-612 (confirm with counsel)");
      add("handbill", "Post or publish the sale handbill", sale ? addDays(sale, -7) : null, "due",
        "Year, make, full VIN, and the date, time and place of the sale.", "KDOR TR-96M instructions");
      add("sale", "Hold the public sale", sale, "due", "Record the buyer and the price.", "K.S.A. 58-202");
      add("title", "MVE-1 inspection and TR-96M affidavit for the buyer", sale, "due",
        "Kansas Highway Patrol inspection, then the Mechanic's Lien Sale Affidavit with the itemized repair bill attached.", "KDOR TR-96M");
      add("buyertitle", "Buyer applies for title", sale ? addDays(sale, 60) : null, "due",
        "Within 60 days of the purchase date on the affidavit.", "KDOR TR-96M");
    }
  }

  if (c.track === "tow") {
    const pos = d("possession"), ver = d("verification"), mailed = d("noticeMailed"), sale = d("saleDate");
    add("feenotice", "Confirm the driver got written notice of storage fees", null, "info",
      "Without that notice, the storage part of the lien is invalid.", "K.S.A. 8-1103(b)");
    add("verify", "Request owner and lienholder verification from the Division of Vehicles", pos ? addDays(pos, 30) : null, "due",
      "No more than 30 days after you took possession.", "K.S.A. 8-1104(a)");
    add("notice", "Mail the notice of sale by certified mail to owner and lienholders", ver ? addDays(ver, 15) : null, "due",
      ver ? `Within 15 calendar days of receiving verification on ${fmt(ver)}.` : "Enter the date you received verification.", "K.S.A. 8-1104(b)");
    add("interstate", "Order an interstate search if Kansas can't verify", null, "info",
      "Not needed when the vehicle is 15+ years old or nonrepairable.", "K.S.A. 8-1104");
    add("earliest", "Earliest sale date (estimate)", (pos || mailed) ? maxD(addDays(pos, 30), addDays(mailed, 15)) : null, "after",
      "Later of 30 days in your possession and 15 days after the notice was mailed.", "K.S.A. 8-1103, 8-1104");
    add("publish", "Publish the auction notice", sale ? addDays(sale, -7) : null, "due",
      sale ? "At least 7 days before the auction." : "Pick a sale date to set this deadline.", "K.S.A. 8-1104");
    add("sale", "Hold the auction and give the buyer a certification of compliance", sale, "due",
      "Then complete the TR-85 Possessory Lien Affidavit so the buyer can title the vehicle.", "K.S.A. 8-1104; HB 2147 (2023); KDOR TR-85");
  }
  return S;
}
function status(c, s) {
  if (s.kind === "info") return { cls: "info", txt: "Note" };
  if (c.done && c.done[s.key]) return { cls: "done", txt: "Done" };
  if (!s.date) return { cls: "wait", txt: "Needs a date" };
  const n = daysFrom(s.date);
  if (s.kind === "after") return n <= 0 ? { cls: "ready", txt: "Allowed now" } : { cls: "up", txt: `In ${n} days` };
  if (n < 0) return { cls: "over", txt: `${-n} days late` };
  if (n === 0) return { cls: "over", txt: "Due today" };
  if (n <= 14) return { cls: "soon", txt: `${n} days left` };
  return { cls: "up", txt: `${n} days left` };
}
function nextUp(c) {
  return steps(c).filter(s => s.kind === "due" && s.date && !c.done[s.key]).sort((a, b) => a.date - b.date)[0] || null;
}

// ---------- documents ----------
const P = (v, label) => (v !== undefined && v !== null && String(v).trim()) ? String(v) : `⟦${label}⟧`;
const vehicleLine = c => { const v = c.vehicle; return `${P(v.year, "year")} ${P(v.make, "make")} ${P(v.model, "model")}, VIN/serial ${P(v.vin, "VIN or serial")}`; };
const isVeh = c => c.track === "repair" || c.track === "tow";
const subjectLine = c => isVeh(c) ? vehicleLine(c) : `work at ${P(c.property.address, "property address")}`;
const signature = c => `Sincerely,\n\n\n______________________________\n${P(c.claimant.name, "your business name")}\n${P(c.claimant.address, "your address")}\n${P(c.claimant.phone, "phone")}`;
const FOOT = "\n\n— Draft prepared with the Dale's Auto Body shop portal. Not legal advice; check current Kansas law before sending or filing.";

function docsFor(c) {
  const list = [{ key: "demand", label: "Demand letter" }];
  if (c.track === "gc" || c.track === "sub") {
    list.push({ key: "lien", label: "Lien statement (draft)" });
    if (!c.residential) list.push({ key: "extension", label: "Notice of extension" });
    list.push({ key: "release", label: "Lien release" });
  } else {
    list.push({ key: "notice", label: "Notice of sale (certified)" }, { key: "handbill", label: "Sale handbill" }, { key: "release", label: "Paid-in-full release" });
  }
  return list;
}
function renderDoc(c, key) {
  norm(c);
  const amt = P(money(c.amount), "amount owed");
  const payBy = longFmt(addDays(TODAY, 10));
  const lastWork = longFmt(D(c.dates.lastWork)) || "⟦date work was completed⟧";
  const sale = D(c.dates.saleDate);
  const saleWhen = sale ? `${longFmt(sale)} at ${P(c.saleTime, "time")}` : "⟦sale date and time⟧";
  const county = P(c.property.county, "county").toUpperCase();
  const lienLaw = c.track === "tow" ? "K.S.A. 8-1103 and 8-1104" : "K.S.A. 58-201 and 58-202";
  const months = c.track === "gc" ? 4 : 3;

  if (key === "demand") {
    let para;
    if (c.track === "repair") para = `Under Kansas law (K.S.A. 58-201), we hold a lien on the property for this amount, and we will keep it until the balance is paid. If it is not paid, we intend to sell it as the law allows and apply the proceeds to what you owe.`;
    else if (c.track === "tow") para = `Under K.S.A. 8-1103, we hold a possessory lien on the vehicle for towing and storage. Storage charges continue to accrue daily. If the balance is not paid, the vehicle may be sold at public auction under K.S.A. 8-1104.`;
    else para = `If the balance is not paid by ${payBy}, we intend to file a mechanic's lien statement against the property at ${P(c.property.address, "property address")} under K.S.A. 60-1101 et seq. We would prefer to settle this without a filing.`;
    return `${longFmt(TODAY)}\n\n${P(c.owner.name, "owner name")}\n${P(c.owner.address, "owner address")}\n\nRe: Unpaid balance of ${amt} for ${subjectLine(c)}\n\nDear ${P(c.owner.name, "owner name")},\n\nOur records show an unpaid balance of ${amt} for ${P(c.description, "description of the work")}, completed on ${lastWork}. We have not received payment.\n\n${para}\n\nPlease pay the full balance by ${payBy}, or call us at ${P(c.claimant.phone, "phone")} to arrange payment.\n\n${signature(c)}${FOOT}`;
  }
  if (key === "lien") {
    const contractor = c.track === "sub" ? `\nContractor:        ${P(c.contractor.name, "general contractor")}, ${P(c.contractor.address, "contractor address")}` : "";
    return `IN THE DISTRICT COURT OF ${county} COUNTY, KANSAS\n\nMECHANIC'S LIEN STATEMENT\n(${c.track === "gc" ? "K.S.A. 60-1102" : "K.S.A. 60-1103"})\n\nClaimant:          ${P(c.claimant.name, "your business name")}, ${P(c.claimant.address, "address for service")}\nOwner of record:   ${P(c.owner.name, "owner of record")}, ${P(c.owner.address, "owner address")}${contractor}\nProperty:          ${P(c.property.address, "property address")}\nLegal description: ${P(c.property.legal, "legal description from the deed")}\n\nThe claimant furnished labor, equipment, material or supplies for improving the property described above: ${P(c.description, "description of the work")}. The claimant last furnished them on ${lastWork}.\n\nItemized statement of the amount claimed:\n  ${P(c.description, "description")} .......... ${amt}\n  (Attach invoices or an itemized list.)\n\nTOTAL CLAIMED: ${amt}\n\nVERIFICATION\nSTATE OF KANSAS, COUNTY OF ______________, ss:\n\n${P(c.claimant.name, "claimant")}, of lawful age, being first duly sworn, states that the claimant named above has read this statement and that the facts in it are true.\n\n______________________________\nSignature and title\n\nSubscribed and sworn to before me on ______________, 20___.\n\n______________________________\nNotary Public          My appointment expires: ____________\n\nFile by: ${fmt(addMonths(D(c.dates.lastWork), months))} (${months} months after last furnishing${c.residential ? "" : "; 1 more month with a notice of extension"}).\nSign in front of the notary; a statement sworn outside the notary's presence is invalid. For the filing itself, use the Kansas Judicial Council's official form.${FOOT}`;
  }
  if (key === "extension") {
    const base = addMonths(D(c.dates.lastWork), months), ext = addMonths(D(c.dates.lastWork), months + 1);
    return `IN THE DISTRICT COURT OF ${county} COUNTY, KANSAS\n\nNOTICE OF EXTENSION OF TIME TO FILE LIEN STATEMENT\n\nClaimant:  ${P(c.claimant.name, "your business name")}, ${P(c.claimant.address, "address")}\nOwner:     ${P(c.owner.name, "owner of record")}\n${c.track === "sub" ? `Contractor: ${P(c.contractor.name, "general contractor")}\n` : ""}Property:  ${P(c.property.address, "property address")}\n           ${P(c.property.legal, "legal description")}\n\nThe claimant last furnished labor, equipment, material or supplies to the property on ${lastWork}. The amount claimed is ${amt}.\n\nThe claimant gives notice that the time to file its lien statement is extended by one month, to ${longFmt(ext) || "⟦extended date⟧"}.\n\n______________________________\n${P(c.claimant.name, "claimant")}\n\n[Notary block]\n\nFile with the clerk before ${longFmt(base) || "⟦original deadline⟧"}, then mail copies as the statute requires. Not available for residential property.${FOOT}`;
  }
  if (key === "release") {
    if (isVeh(c)) return `RELEASE OF LIEN AND RECEIPT OF PAYMENT\n\n${longFmt(TODAY)}\n\n${P(c.claimant.name, "your business name")} acknowledges receipt of ${amt} from ${P(c.owner.name, "owner")} in full payment of all charges for ${vehicleLine(c)}.\n\nAny lien held on this property under ${lienLaw} is released, and it has been returned to the owner.\n\n______________________________\n${P(c.claimant.name, "claimant")}${FOOT}`;
    return `IN THE DISTRICT COURT OF ${county} COUNTY, KANSAS\n\nRELEASE OF MECHANIC'S LIEN\n\nFor value received, ${P(c.claimant.name, "claimant")} releases the mechanic's lien it filed in this court on ${longFmt(D(c.dates.filed)) || "⟦filing date⟧"}, case or file no. ⟦number⟧, against the property at ${P(c.property.address, "property address")}, legal description ${P(c.property.legal, "legal description")}, owned by ${P(c.owner.name, "owner")}.\n\n______________________________\n${P(c.claimant.name, "claimant")}\n\n[Notary block]${FOOT}`;
  }
  if (key === "notice") {
    return `NOTICE OF SALE — SENT BY CERTIFIED MAIL, RETURN RECEIPT REQUESTED\n\n${longFmt(TODAY)}\n\nTo: ${P(c.owner.name, "registered owner")}\n    ${P(c.owner.address, "owner address")}\n    and every lienholder of record: ${P(c.lienholders, "lienholder names and addresses, or None")}\n\nProperty:    ${vehicleLine(c)}\nPlate:       ${P(c.vehicle.plate, "plate (if any)")}\nAmount owed: ${amt} as of today${c.track === "tow" ? ", plus storage that continues to accrue daily" : ""}\n\n${P(c.claimant.name, "your business name")} holds a lien on this property under ${lienLaw} for ${P(c.description, "charges")}.\n\nUnless the full amount is paid, it will be sold at public auction on ${saleWhen} at ${P(c.claimant.address, "sale location")}.\n\nYou may get it back by paying the full amount owed before the sale. Contact ${P(c.claimant.phone, "phone")}.\n\n______________________________\n${P(c.claimant.name, "claimant")}\n\nCertified mail article no.: ____________________${FOOT}`;
  }
  if (key === "handbill") {
    return `PUBLIC SALE\n\n${saleWhen}\n${P(c.claimant.address, "sale location")}\n\n${P(c.vehicle.year, "year")} ${P(c.vehicle.make, "make")} ${P(c.vehicle.model, "model")}\nVIN/serial ${P(c.vehicle.vin, "full VIN or serial")}\n\nThis property will be sold to the highest bidder to satisfy a lien held by ${P(c.claimant.name, "your business name")} under ${lienLaw} for ${c.track === "tow" ? "towing and storage" : "repairs, parts and labor"}.\n\nThe owner may redeem it before the sale by paying the amount owed.\nInquiries: ${P(c.claimant.phone, "phone")}${FOOT}`;
  }
  return "";
}

window.KS = { TRACKS, D, iso, get TODAY() { return TODAY; }, refreshToday, addDays, addMonths, fmt, longFmt, daysFrom, money, norm, steps, status, nextUp, docsFor, renderDoc };
})();
