/* OPay-style demo — front-end logic. All HTTP still goes through the GoldPayNative bridge (Kotlin). */
"use strict";

/* ================= tiny helpers ================= */
const $ = (id) => document.getElementById(id);
const N = (n) => Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = (p) => (p || "TXN") + "_" + Date.now();
const nowParts = () => {
  const d = new Date();
  return {
    iso: d.toISOString(),
    date: d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
  };
};

/* ================= native bridge (browser-dev mock) ================= */
const mockNative = {
  binGet: () => localStorage.getItem("gp_bin") || JSON.stringify({ version: "2.1" }),
  binPut: (b) => { localStorage.setItem("gp_bin", b); return true; },
  binProbe: () => "wallets",
  sendCreditSms: () => console.log("[mock SMS]"),
  accountToE164: (a) => (a && a.startsWith("019") ? "+234" + a.slice(3) : ""),
  getBanks: () => JSON.stringify([{ code: "058", name: "GTBank" }, { code: "044", name: "Access Bank" }, { code: "999992", name: "Moniepoint MFB" }]),
  resolveAccountName: () => "unknown",
  paystackKeySource: () => "",
  setPaystackKey: () => {}, getPaystackKey: () => "", clearPaystackKey: () => {},
  setTheme: (t) => localStorage.setItem("gp_theme", t),
  getTheme: () => localStorage.getItem("gp_theme") || "light",
  setBiometric: () => {}, getBiometric: () => false,
  setBeneficiaries: (j) => localStorage.setItem("gp_ben", j), getBeneficiaries: () => localStorage.getItem("gp_ben") || "[]",
  setContacts: () => {}, getContacts: () => "{}",
  setSession: (p) => localStorage.setItem("gp_sess", p || ""),
  getSession: () => localStorage.getItem("gp_sess"),
  clearSession: () => localStorage.removeItem("gp_sess"),
  getSenderId: () => "OPay", getAppVersion: () => "1.0-opay",
  pickAvatar: () => {}, consumePickedAvatar: () => "",
  toast: (m) => alert(m), haptic: () => {}
};
const Native = typeof GoldPayNative !== "undefined" ? GoldPayNative : mockNative;

/* ================= state ================= */
let ME = null;
let hideBal = false;
let banks = null;
const GUEST_PHONE = "0198123456789";
const GUEST_ACCOUNT = "0198123456789";
const WELCOME_BONUS = 5000000;

/* guest wallet factory */
function guestWallet() {
  const t = nowParts();
  return {
    id: "guest",
    fullname: "OPay Demo User",
    phone: GUEST_PHONE,
    email: "",
    bvn: "2219" + GUEST_PHONE.slice(3, 10),
    transactionPin: "0000",
    accountNumber: GUEST_ACCOUNT,
    walletAddress: "GP_GUEST_" + Date.now(),
    balance: WELCOME_BONUS,
    avatar: "",
    cards: [],
    notifications: [],
    transactions: [{ id: uid("BONUS"), type: "received", amount: WELCOME_BONUS, description: "Welcome Bonus", date: t.iso, status: "successful" }],
    isGuest: true
  };
}

/* ================= localStorage-backed persistence ================= */
function loadLocalWallet(acc) {
  try {
    const rec = localStorage.getItem("gp_wallet_" + acc);
    return rec ? JSON.parse(rec) : null;
  } catch (e) {
    return null;
  }
}
function saveLocalWallet(w) {
  const key = "gp_wallet_" + w.accountNumber;
  localStorage.setItem(key, JSON.stringify(w));
  Native.setSession(w.accountNumber);
}
function deleteLocalWallet(acc) {
  localStorage.removeItem("gp_wallet_" + acc);
  if (ME && ME.accountNumber === acc) ME = null;
}

/* ================= normalizeDest / find wallet (local only) ================= */
function normalizeDest(input) {
  const raw = String(input || "").trim();
  if (raw.toUpperCase().startsWith("GP_")) return { walletAddress: raw };
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 13 && digits.startsWith("019")) return { accountNumber: digits };
  if (digits.length === 11 && digits.startsWith("0")) return { accountNumber: "019" + digits.slice(1) };
  if (digits.length === 10) return { accountNumber: "019" + digits };
  return null;
}
function findLocalWallet(ref) {
  const acc = ref.accountNumber && ref.accountNumber.startsWith("019") ? ref.accountNumber : null;
  if (acc) {
    const w = loadLocalWallet(acc);
    if (w) return w;
  }
  if (ref.walletAddress) {
    const keys = Object.keys(localStorage).filter(k => k.indexOf("gp_wallet_") === 0);
    for (const k of keys) {
      try {
        const w = JSON.parse(localStorage.getItem(k));
        if (w && (w.walletAddress || "").toLowerCase() === ref.walletAddress.toLowerCase()) return w;
      } catch (e) {}
    }
  }
  /* fallback: treat guest wallet if ref matches guest account */
  if (ref.accountNumber === GUEST_ACCOUNT) return guestWallet();
  return null;
}

/* ================= theme / screens / nav ================= */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  Native.setTheme(t);
  $("#dark-toggle").checked = t === "dark";
  /* only set on root, not the transient splash */
}
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $("#screen-" + name).classList.add("active");
}
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $("#view-" + name).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.nav === name));
  if (name === "send") ensureBanks();
  if (name === "history") renderHistory();
  if (name === "cards") renderCards();
  if (name === "notifs") renderNotifs();
  if (name === "profile") fillProfile();
  if (name === "settings") fillSettings();
  if (name === "invest") renderInvest();
  if (name === "bills") switchBillsTab($("#view-bills .seg.active") ? $("#view-bills .seg.active").dataset.tab : "water");
  if (name === "addmoney") switchAddMoneyTab($("#view-addmoney .seg.active") ? $("#view-addmoney .seg.active").dataset.tab : "self");
  $("#views").scrollTop = 0;
}

/* ================= auth ================= */
function boot() {
  applyTheme(Native.getTheme() || "light");
  const sess = Native.getSession();
  setTimeout(() => {
    if (sess) {
      const w = loadLocalWallet(sess);
      if (w && !w.isGuest) {
        ME = w;
        enterApp();
        return;
      }
    }
    showScreen("auth");
  }, 1400);
}

function authMode() {
  const checked = document.querySelector('input[name="authMode"]:checked');
  return checked ? checked.value : "guest";
}
function showAuthModeFields() {
  const fields = $("#auth-account-fields");
  if (authMode() === "account") {
    fields.classList.remove("hidden");
  } else {
    fields.classList.add("hidden");
  }
}
document.querySelectorAll('input[name="authMode"]').forEach((r) => r.addEventListener("change", showAuthModeFields));

function signin() {
  if (authMode() === "guest") {
    ME = guestWallet();
    saveLocalWallet(ME);
    enterApp();
    return;
  }
  let identifier = $("#auth-identifier").value.replace(/[^0-9]/g, "");
  const pin = $("#auth-pin").value;
  if (identifier.length < 10 || identifier.length > 13) return Native.toast("Enter a valid account number or phone number.");
  if (!/^[0-9]{4}$/.test(pin)) return Native.toast("Enter your 4-digit PIN.");
  if (identifier.length === 10 && identifier.startsWith("0")) identifier = "019" + identifier.slice(1);
  if (identifier.length === 10) identifier = "019" + identifier;
  if (!identifier.startsWith("019") || identifier.length !== 13) return Native.toast("Account must start with 019.");
  const acc = identifier;
  const w = loadLocalWallet(acc);
  if (!w) return Native.toast("Account not found — create one first.");
  if (w.transactionPin !== pin) return Native.toast("Wrong PIN.");
  ME = w;
  saveLocalWallet(w);
  enterApp();
}
function register() {
  const name = $("#reg-name").value.trim();
  const phone = $("#reg-phone").value.replace(/[^0-9]/g, "");
  const pin = $("#reg-pin").value;
  const pin2 = $("#reg-pin2").value;
  if (name.length < 3) return Native.toast("Enter your full name.");
  if (phone.length !== 10 || phone.startsWith("0")) return Native.toast("Phone must be 10 digits without leading 0.");
  if (!/^[0-9]{4}$/.test(pin)) return Native.toast("PIN must be 4 digits.");
  if (pin !== pin2) return Native.toast("PINs do not match.");
  if (!$("#reg-terms").checked) return Native.toast("Please accept the demo notice.");

  const acc = "019" + phone;
  if (loadLocalWallet(acc)) return Native.toast("Account already exists — please sign in.");

  const t = nowParts();
  ME = {
    id: String(Date.now()),
    fullname: name,
    phone: acc,
    email: "",
    bvn: "2219" + phone.slice(0, 7),
    transactionPin: pin,
    accountNumber: acc,
    walletAddress: "GP_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6).toUpperCase(),
    balance: WELCOME_BONUS,
    avatar: "",
    cards: [],
    notifications: [],
    transactions: [{ id: uid("BONUS"), type: "received", amount: WELCOME_BONUS, description: "Welcome Bonus", date: t.iso, status: "successful" }]
  };
  saveLocalWallet(ME);
  const e164 = Native.accountToE164(acc);
  if (e164) Native.sendCreditSms(e164, N(WELCOME_BONUS), "OPay Demo", "0190000000000", t.date, t.time, "Welcome Bonus", N(ME.balance), ME.transactions[0].id);
  Native.toast("Welcome! ₦5,000,000 demo bonus credited.");
  enterApp();
}
function enterApp() {
  showScreen("app");
  renderAll();
  showView("home");
}
function renderAll() {
  renderGreeting();
  renderBalance();
  renderRecent();
  renderBene();
  renderInvest();
}

function renderGreeting() {
  const h = new Date().getHours();
  $("#greeting").textContent = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  $("#greet-name").textContent = ME.fullname;
  if (ME.avatar) { $("#avatar-img").src = ME.avatar; $("#profile-avatar").src = ME.avatar; }
}
function renderBalance() {
  $("#bal-acc").textContent = ME.accountNumber;
  $("#bal-amount").textContent = hideBal ? "₦ ••••••" : "₦" + N(ME.balance);
  $("#btn-eye").textContent = hideBal ? "🚫" : "👁";
}
function txRow(tx) {
  const pos = tx.type === "received";
  const ic = pos ? "⬇️" : tx.description && tx.description.startsWith("Welcome") ? "🎁" : "⬆️";
  return '<li><div class="tx-ic">' + ic + '</div><div class="tx-main"><p class="tx-title">' + esc(tx.description) +
    '</p><p class="tx-sub">' + esc((tx.date || "").slice(0, 10)) + " · " + esc(tx.status || "successful") +
    '</p></div><p class="tx-amt ' + (pos ? "pos" : "neg") + '">' + (pos ? "+" : "−") + "₦" + N(tx.amount) + "</p></li>";
}
function renderRecent() {
  const list = (ME.transactions || []).slice(0, 5);
  $("#recent-list").innerHTML = list.map(txRow).join("") || "";
}
function renderHistory() {
  const all = (ME.transactions || []).slice().reverse();
  $("#history-list").innerHTML = all.map(txRow).join("");
  $("#history-empty").classList.toggle("hidden", all.length > 0);
}
function renderNotifs() {
  const all = (ME.notifications || []).slice().reverse();
  $("#notif-list").innerHTML = all.map((n) =>
    '<li><div class="tx-ic">🔔</div><div class="tx-main"><p class="tx-title">' + esc(n.title) +
    '</p><p class="tx-sub">' + esc(n.body) + '</p></div><p class="tx-amt">' + esc((n.date || "").slice(0, 10)) + "</p></li>").join("");
  $("#notif-empty").classList.toggle("hidden", all.length > 0);
}

/* ================= PIN modal ================= */
let pinCb = null;
function askPin(title, sub, cb) {
  $("#pin-title").textContent = title || "Enter PIN";
  $("#pin-sub").textContent = sub || "";
  $("#pin-input").value = "";
  $("#pin-modal").classList.remove("hidden");
  pinCb = cb;
}
$("#pin-ok").addEventListener("click", () => {
  const v = $("#pin-input").value;
  if (!/^[0-9]{4}$/.test(v)) return Native.toast("Enter your 4-digit PIN.");
  $("#pin-modal").classList.add("hidden");
  const cb = pinCb; pinCb = null;
  if (cb) cb(v);
});
$("#pin-cancel").addEventListener("click", () => { $("#pin-modal").classList.add("hidden"); pinCb = null; });
$("#pin-close").addEventListener("click", () => { $("#pin-modal").classList.add("hidden"); pinCb = null; });

/* ================= receipt (OPay-style) ================= */
function showReceipt(r) {
  $("#r-title").textContent = r.title || "Payment Successful";
  $("#r-amount").textContent = "₦" + N(r.amount);
  $("#r-recipient").textContent = r.recipient || "—";
  $("#r-product").textContent = r.product || "—";
  $("#r-date").textContent = r.date || "";
  $("#r-time").textContent = r.time || "";
  $("#r-txid").textContent = r.txId || "";
  $("#r-channel").textContent = r.channel || "OPay Wallet";
  $("#r-total").textContent = "₦" + N(r.amount);
  $("#receipt-modal").classList.remove("hidden");
  Native.haptic();
}
$("#r-done").addEventListener("click", () => { $("#receipt-modal").classList.add("hidden"); renderAll(); });

/* ================= beneficiaries ================= */
function addBeneficiary(b) {
  let list = [];
  try { list = JSON.parse(Native.getBeneficiaries() || "[]"); } catch (e) {}
  list = list.filter((x) => x.dest !== b.dest);
  list.unshift(b);
  Native.setBeneficiaries(JSON.stringify(list.slice(0, 12)));
}
function renderBene() {
  let list = [];
  try { list = JSON.parse(Native.getBeneficiaries() || "[]"); } catch (e) {}
  $("#bene-list").innerHTML = list.map((b) =>
    '<li><div class="tx-ic">👤</div><div class="tx-main"><p class="tx-title">' + esc(b.name) +
    '</p><p class="tx-sub">' + esc(b.dest) + '</p></div><button class="pill" data-bene-send="' + esc(b.dest) + '">Send</button></li>').join("");
  $("#bene-empty").classList.toggle("hidden", list.length > 0);
}

/* ================= send money — wallet tab ================= */
let walletTarget = null;
function switchWalletTab(name) {
  document.querySelectorAll("#view-send .seg").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  ["wallet", "bank", "bene"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", t !== name));
  if (name === "bene") renderBene();
  if (name === "bank") ensureBanks();
}
document.querySelectorAll("#view-send .seg").forEach((t) => t.addEventListener("click", () => switchWalletTab(t.dataset.tab)));

$("#btn-verify-wallet").addEventListener("click", () => {
  const ref = normalizeDest($("#wallet-dest").value);
  const box = $("#wallet-verified");
  if (!ref) { box.classList.remove("hidden"); box.innerHTML = "⚠️ Invalid format. Use 019…, 10-digit phone, or GP_ address."; walletTarget = null; return; }
  const w = findLocalWallet(ref);
  if (!w) { box.classList.remove("hidden"); box.innerHTML = "⚠️ No OPay wallet found for that destination."; walletTarget = null; return; }
  walletTarget = w;
  box.classList.remove("hidden");
  box.innerHTML = "✔ " + esc(w.fullname) + " · " + esc(w.accountNumber);
});

$("#btn-send-wallet").addEventListener("click", () => {
  const amt = Number($("#wallet-amount").value);
  if (!walletTarget) return Native.toast("Verify the recipient first.");
  if (!(amt > 0)) return Native.toast("Enter a valid amount.");
  if (walletTarget.accountNumber === ME.accountNumber) return Native.toast("You cannot send to yourself.");
  askPin("Confirm transfer", "₦" + N(amt) + " to " + walletTarget.fullname, (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    if (ME.balance < amt) return Native.toast("Insufficient balance.");
    const fresh = findLocalWallet({ accountNumber: walletTarget.accountNumber });
    if (!fresh) return Native.toast("Recipient wallet no longer exists.");
    const t = nowParts();
    const txId = uid("TXN");
    ME.balance -= amt;
    fresh.balance = Number(fresh.balance || 0) + amt;
    const sent = { id: txId, type: "sent", amount: amt, description: "Sent to " + fresh.fullname, narration: $("#wallet-narr").value, date: t.iso, status: "successful", recipientName: fresh.fullname, recipientAccount: fresh.accountNumber };
    const got = { id: txId, type: "received", amount: amt, description: "Received from " + ME.fullname, narration: $("#wallet-narr").value, date: t.iso, status: "successful", senderName: ME.fullname, senderAccount: ME.accountNumber };
    ME.transactions.unshift(sent);
    fresh.transactions = fresh.transactions || [];
    fresh.transactions.unshift(got);
    fresh.notifications = fresh.notifications || [];
    fresh.notifications.unshift({ title: "Credit alert", body: "₦" + N(amt) + " from " + ME.fullname, date: t.iso });
    saveLocalWallet(ME);
    saveLocalWallet(fresh);
    addBeneficiary({ name: fresh.fullname, dest: fresh.accountNumber });
    const e164 = Native.accountToE164(fresh.accountNumber);
    if (e164) Native.sendCreditSms(e164, N(amt), ME.fullname, ME.accountNumber, t.date, t.time, "OPay Transfer", N(fresh.balance), txId);
    ME = loadLocalWallet(ME.accountNumber);
    renderAll();
    showReceipt({ amount: amt, recipient: fresh.fullname + " (" + fresh.accountNumber + ")", product: "OPay Transfer", date: t.date, time: t.time, txId: txId });
    $("#wallet-dest").value = ""; $("#wallet-amount").value = ""; $("#wallet-narr").value = "";
    $("#wallet-verified").classList.add("hidden"); walletTarget = null;
  });
});

/* ================= send money — bank tab ================= */
function ensureBanks() {
  if (banks) return;
  try { banks = JSON.parse(Native.getBanks() || "[]"); } catch (e) { banks = []; }
  const sel = $("#bank-select");
  sel.innerHTML = banks.map((b) => '<option value="' + esc(b.code) + '">' + esc(b.name) + "</option>").join("");
}
let bankTarget = null;
$("#btn-verify-bank").addEventListener("click", () => {
  const acc = $("#bank-acc").value.replace(/[^0-9]/g, "");
  const code = $("#bank-select").value;
  const box = $("#bank-verified");
  if (acc.length !== 10 || !code) { box.classList.remove("hidden"); box.innerHTML = "⚠️ Enter a 10-digit account and pick a bank."; bankTarget = null; return; }
  ensureBanks();
  const bankName = (banks.find((b) => b.code === code) || {}).name || "";
  const name = Native.resolveAccountName(acc, code);
  bankTarget = { acc, code, bankName, name };
  box.classList.remove("hidden");
  box.innerHTML = "✔ " + esc(name === "unknown" ? "Name unavailable (no Paystack key)" : name) + " · " + esc(bankName);
});

$("#btn-send-bank").addEventListener("click", () => {
  const amt = Number($("#bank-amount").value);
  if (!bankTarget) return Native.toast("Verify the account first.");
  if (!(amt > 0)) return Native.toast("Enter a valid amount.");
  askPin("Confirm transfer", "₦" + N(amt) + " to " + bankTarget.acc + " (" + bankTarget.bankName + ")", (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    if (ME.balance < amt) return Native.toast("Insufficient balance.");
    const t = nowParts();
    const txId = uid("EXT");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: "Transfer to " + bankTarget.name + " (" + bankTarget.bankName + ")", narration: $("#bank-narr").value, date: t.iso, status: "successful", bankName: bankTarget.bankName, accountNumber: bankTarget.acc, accountName: bankTarget.name });
    saveLocalWallet(ME);
    addBeneficiary({ name: bankTarget.name + " (" + bankTarget.bankName + ")", dest: bankTarget.acc });
    showReceipt({ amount: amt, recipient: bankTarget.name + " · " + bankTarget.bankName, product: "Bank Transfer", date: t.date, time: t.time, txId: txId });
    $("#bank-acc").value = ""; $("#bank-amount").value = ""; $("#bank-narr").value = "";
    $("#bank-verified").classList.add("hidden"); bankTarget = null;
  });
});

/* ================= airtime & data ================= */
function bindPills(rowId, cb) {
  const row = $(rowId);
  row.addEventListener("click", (e) => {
    const b = e.target.closest(".pill");
    if (!b) return;
    row.querySelectorAll(".pill").forEach((p) => p.classList.remove("active"));
    b.classList.add("active");
    if (cb) cb(b);
  });
}
function bindPlans(rowId, cb) {
  const row = $(rowId);
  row.addEventListener("click", (e) => {
    const b = e.target.closest(".plan");
    if (!b) return;
    row.querySelectorAll(".plan").forEach((p) => p.classList.remove("active"));
    b.classList.add("active");
    if (cb) cb(b);
  });
}

$("#btn-airtime").addEventListener("click", () => {
  const phone = $("#airtime-phone").value.replace(/[^0-9]/g, "");
  const amt = Number($("#airtime-amount").value);
  const net = (document.querySelector("#airtime-networks .pill.active") || {}).dataset ? document.querySelector("#airtime-networks .pill.active").dataset.net : "MTN";
  if (phone.length < 10) return Native.toast("Enter a valid phone number.");
  if (!(amt > 0)) return Native.toast("Enter a valid amount.");
  askPin("Confirm airtime", net + " ₦" + N(amt) + " for " + phone, (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    if (ME.balance < amt) return Native.toast("Insufficient balance.");
    const t = nowParts();
    const txId = uid("AIR");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: net + " Airtime — " + phone, date: t.iso, status: "successful" });
    saveLocalWallet(ME);
    showReceipt({ amount: amt, recipient: phone, product: net + " Airtime", date: t.date, time: t.time, txId: txId });
  });
});

$("#btn-data").addEventListener("click", () => {
  const phone = $("#data-phone").value.replace(/[^0-9]/g, "");
  const plan = document.querySelector("#data-plans .plan.active");
  if (!plan) return Native.toast("Pick a data plan.");
  if (phone.length < 10) return Native.toast("Enter a valid phone number.");
  const amt = Number(plan.dataset.price);
  const label = plan.dataset.label;
  askPin("Confirm data", label + " for " + phone, (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    if (ME.balance < amt) return Native.toast("Insufficient balance.");
    const t = nowParts();
    const txId = uid("DATA");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: label + " — " + phone, date: t.iso, status: "successful" });
    saveLocalWallet(ME);
    showReceipt({ amount: amt, recipient: phone, product: label, date: t.date, time: t.time, txId: txId });
  });
});

/* ================= bills — electricity ================= */
$("#btn-verify-meter").addEventListener("click", () => {
  const m = $("#meter-no").value.trim();
  const box = $("#meter-verified");
  if (m.length < 6) { box.classList.remove("hidden"); box.innerHTML = "⚠️ Enter a valid meter number."; return; }
  const names = ["ADAMU IBRAHIM S", "CHIOMA OKEKE V", "FOLARIN BALOGUN E", "AISHA BELLO M", "EMEKA NWACHUKWU P"];
  const nm = names[m.length % names.length];
  box.classList.remove("hidden");
  box.innerHTML = "✔ " + esc(nm) + " · " + esc($("#disco-select").selectedOptions[0].textContent);
});

$("#btn-electricity").addEventListener("click", () => {
  const amt = Number($("#meter-amount").value);
  const meter = $("#meter-no").value.trim();
  if (!(amt > 0) || meter.length < 6) return Native.toast("Enter meter and amount first.");
  const disco = $("#disco-select").selectedOptions[0].textContent;
  askPin("Confirm payment", disco + " ₦" + N(amt), (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    if (ME.balance < amt) return Native.toast("Insufficient balance.");
    const t = nowParts();
    const txId = uid("PWR");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: disco + " — Meter " + meter, date: t.iso, status: "successful" });
    saveLocalWallet(ME);
    showReceipt({ amount: amt, recipient: "Meter " + meter, product: disco, date: t.date, time: t.time, txId: txId });
  });
});

$("#btn-verify-cable").addEventListener("click", () => {
  const sc = $("#smartcard-no").value.trim();
  const box = $("#cable-verified");
  if (sc.length < 6) { box.classList.remove("hidden"); box.innerHTML = "⚠️ Enter a valid smartcard number."; return; }
  const names = ["THE OJO FAMILY", "MUSA DANLADI H", "GRACE EMEKA C", "SANI MUSA APT 4B"];
  box.classList.remove("hidden");
  box.innerHTML = "✔ " + esc(names[sc.length % names.length]);
});

$("#btn-cable").addEventListener("click", () => {
  const sc = $("#smartcard-no").value.trim();
  const sel = $("#bouquet-select").value.split("|");
  const amt = Number(sel[1]);
  const bouquet = sel[0];
  if (!(amt > 0) || sc.length < 6) return Native.toast("Enter smartcard and pick a bouquet.");
  const prov = $("#cable-provider").value;
  askPin("Confirm payment", prov + " " + bouquet + " ₦" + N(amt), (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    if (ME.balance < amt) return Native.toast("Insufficient balance.");
    const t = nowParts();
    const txId = uid("TVC");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: prov + " " + bouquet + " — " + sc, date: t.iso, status: "successful" });
    saveLocalWallet(ME);
    showReceipt({ amount: amt, recipient: "Smartcard " + sc, product: prov + " · " + bouquet, date: t.date, time: t.time, txId: txId });
  });
});

$("#btn-internet").addEventListener("click", () => {
  const id = $("#edu-id").value.trim();
  const sel = $("#edu-plan").value.split("|");
  const amt = Number(sel[1]);
  const plan = sel[0];
  if (!id) return Native.toast("Enter the account / student ID.");
  askPin("Confirm payment", plan + " ₦" + N(amt), (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    if (ME.balance < amt) return Native.toast("Insufficient balance.");
    const t = nowParts();
    const txId = uid("EDU");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: plan + " — " + id, date: t.iso, status: "successful" });
    saveLocalWallet(ME);
    showReceipt({ amount: amt, recipient: "ID " + id, product: plan, date: t.date, time: t.time, txId: txId });
  });
});

$("#btn-water").addEventListener("click", () => {
  const id = $("#water-id").value.trim();
  const amt = Number($("#water-amount").value);
  const board = $("#water-board").value;
  if (!id || !(amt > 0)) return Native.toast("Enter account and amount.");
  askPin("Confirm payment", board + " ₦" + N(amt), (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    if (ME.balance < amt) return Native.toast("Insufficient balance.");
    const t = nowParts();
    const txId = uid("WTR");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: board + " — " + id, date: t.iso, status: "successful" });
    saveLocalWallet(ME);
    showReceipt({ amount: amt, recipient: board + " · " + id, product: "Water bill", date: t.date, time: t.time, txId: txId });
  });
});

/* ================= add money (deposit) ================= */
let addmoneyTarget = null;
$("#addmoney-dest").addEventListener("input", () => {
  const ref = normalizeDest($("#addmoney-dest").value);
  const box = $("#addmoney-destbox");
  if (!ref || !ref.accountNumber) { box.classList.remove("hidden"); box.innerHTML = "⚠️ Invalid account format."; addmoneyTarget = null; return; }
  const w = findLocalWallet(ref);
  if (!w) { box.classList.remove("hidden"); box.innerHTML = "⚠️ No OPay wallet found for that destination."; addmoneyTarget = null; return; }
  addmoneyTarget = w;
  box.classList.remove("hidden");
  box.innerHTML = "✔ " + esc(w.fullname) + " · " + esc(w.accountNumber);
});
$("#btn-addmoney").addEventListener("click", () => {
  const destRef = normalizeDest($("#addmoney-dest").value);
  const amt = Number($("#addmoney-amount").value);
  const srcAcc = $("#addmoney-source").value.replace(/[^0-9]/g, "");
  if (!addmoneyTarget) return Native.toast("Select the destination wallet first.");
  if (!(amt > 0)) return Native.toast("Enter a valid amount.");
  if (!srcAcc) return Native.toast("Enter a source account (simulated).");
  if (addmoneyTarget.accountNumber === ME.accountNumber) return Native.toast("You cannot deposit to yourself.");
  askPin("Confirm deposit", "₦" + N(amt) + " to " + addmoneyTarget.fullname, (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    const t = nowParts();
    const txId = uid("DEP");
    const incoming = { id: txId, type: "received", amount: amt, description: "Deposited from " + srcAcc, narration: "Add money", date: t.iso, status: "successful", senderAccount: srcAcc };
    addmoneyTarget.transactions = addmoneyTarget.transactions || [];
    addmoneyTarget.transactions.unshift(incoming);
    addmoneyTarget.notifications = addmoneyTarget.notifications || [];
    addmoneyTarget.notifications.unshift({ title: "Credit alert", body: "₦" + N(amt) + " deposited", date: t.iso });
    saveLocalWallet(addmoneyTarget);
    ME.transactions = ME.transactions || [];
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: "Deposit to " + addmoneyTarget.fullname, narration: "Add money", date: t.iso, status: "successful", recipientName: addmoneyTarget.fullname, recipientAccount: addmoneyTarget.accountNumber });
    saveLocalWallet(ME);
    addBeneficiary({ name: addmoneyTarget.fullname, dest: addmoneyTarget.accountNumber });
    const e164 = Native.accountToE164(addmoneyTarget.accountNumber);
    if (e164) Native.sendCreditSms(e164, N(amt), "OPay (deposit)", srcAcc, t.date, t.time, "Deposit", N(addmoneyTarget.balance), txId);
    ME = loadLocalWallet(ME.accountNumber);
    renderAll();
    showReceipt({ amount: amt, recipient: addmoneyTarget.fullname + " (" + addmoneyTarget.accountNumber + ")", product: "Add money", date: t.date, time: t.time, txId: txId, channel: "External Bank" });
    $("#addmoney-dest").value = ""; $("#addmoney-amount").value = ""; $("#addmoney-source").value = "";
    $("#addmoney-destbox").classList.add("hidden"); addmoneyTarget = null;
  });
});

/* add money — transfer to another (simulated external deposit) */
$("#btn-addmoney-transfer").addEventListener("click", () => {
  const toRef = normalizeDest($("#addmoney-transfer-to").value);
  const amt = Number($("#addmoney-transfer-amount").value);
  if (!toRef || !toRef.accountNumber) return Native.toast("Enter a valid destination account.");
  if (!(amt > 0)) return Native.toast("Enter a valid amount.");
  if (toRef.accountNumber === ME.accountNumber) return Native.toast("You cannot deposit to yourself.");
  askPin("Confirm deposit", "₦" + N(amt) + " to " + toRef.accountNumber, (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    const t = nowParts();
    const txId = uid("DEP2");
    const target = toRef.accountNumber === GUEST_ACCOUNT ? guestWallet() : loadLocalWallet(toRef.accountNumber) || { accountNumber: toRef.accountNumber, fullname: "Recipient", balance: 0, transactions: [], notifications: [] };
    target.transactions = target.transactions || [];
    target.transactions.unshift({ id: txId, type: "received", amount: amt, description: "Deposited from external", narration: "Add money", date: t.iso, status: "successful" });
    target.notifications = target.notifications || [];
    target.notifications.unshift({ title: "Credit alert", body: "₦" + N(amt) + " deposited", date: t.iso });
    if (target.accountNumber !== ME.accountNumber) saveLocalWallet(target);
    ME.transactions = ME.transactions || [];
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: "Deposit to " + target.fullname, narration: "Add money", date: t.iso, status: "successful", recipientName: target.fullname, recipientAccount: target.accountNumber });
    saveLocalWallet(ME);
    addBeneficiary({ name: target.fullname, dest: target.accountNumber });
    const e164 = Native.accountToE164(target.accountNumber);
    if (e164) Native.sendCreditSms(e164, N(amt), "OPay (deposit)", "0190000000000", t.date, t.time, "Deposit", N(target.balance), txId);
    ME = loadLocalWallet(ME.accountNumber);
    renderAll();
    showReceipt({ amount: amt, recipient: target.fullname + " (" + target.accountNumber + ")", product: "Add money", date: t.date, time: t.time, txId: txId, channel: "External Bank" });
    $("#addmoney-transfer-to").value = ""; $("#addmoney-transfer-amount").value = "";
  });
});

function switchAddMoneyTab(name) {
  document.querySelectorAll("#view-addmoney .seg").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  ["self", "transfer"].forEach((t) => $("#tab-" + t).classList.toggle("hidden", t !== name));
}
document.querySelectorAll("#view-addmoney .seg").forEach((t) => t.addEventListener("click", () => switchAddMoneyTab(t.dataset.tab)));

/* ================= cards ================= */
function renderCards() {
  const cards = ME.cards || [];
  $("#card-list").innerHTML = cards.map((c) =>
    '<li><div style="position:relative;z-index:1"><div class="card-top"><span>OPay Demo Card</span><span>' + esc(c.brand) + '</span></div>' +
    '<div class="card-num">•••• •••• •••• ' + esc(c.last4) + '</div>' +
    '<div class="card-exp">EXP ' + esc(c.exp) + '</div></div></li>').join("");
  $("#cards-empty").classList.toggle("hidden", cards.length > 0);
  const ctx = (ME.transactions || []).filter((x) => x.id && x.id.startsWith("CARD"));
  $("#card-tx").innerHTML = ctx.map(txRow).join("");
}

$("#btn-add-card").addEventListener("click", () => {
  const num = $("#card-number").value.replace(/[^0-9]/g, "");
  const exp = $("#card-exp").value.trim();
  const cvv = $("#card-cvv").value.trim();
  if (num.length < 13) return Native.toast("Card number looks invalid (mock check).");
  if (!/^\d{2}\/\d{2}$/.test(exp)) return Native.toast("Expiry must be MM/YY.");
  if (!/^\d{3}$/.test(cvv)) return Native.toast("CVV must be 3 digits.");
  const t = nowParts();
  const txId = uid("CARD");
  ME.cards = ME.cards || [];
  ME.cards.push({ last4: num.slice(-4), exp: exp, brand: num.startsWith("4") ? "Verve" : num.startsWith("5") ? "Mastercard" : "Visa" });
  ME.transactions.unshift({ id: txId, type: "sent", amount: 0, description: "Card added •••• " + num.slice(-4), date: t.iso, status: "successful" });
  saveLocalWallet(ME);
  Native.toast("Card saved (mock — nothing was charged).");
  renderCards();
  $("#card-number").value = ""; $("#card-exp").value = ""; $("#card-cvv").value = "";
});

/* ================= security ================= */
$("#btn-change-pin").addEventListener("click", () => {
  const oldP = $("#sec-oldpin").value;
  const p1 = $("#sec-newpin").value;
  const p2 = $("#sec-newpin2").value;
  if (oldP !== ME.transactionPin) return Native.toast("Current PIN is wrong.");
  if (!/^[0-9]{4}$/.test(p1)) return Native.toast("New PIN must be 4 digits.");
  if (p1 !== p2) return Native.toast("New PINs do not match.");
  ME.transactionPin = p1;
  saveLocalWallet(ME);
  Native.toast("PIN changed successfully.");
  $("#sec-oldpin").value = ""; $("#sec-newpin").value = ""; $("#sec-newpin2").value = "";
});

$("#bio-toggle").addEventListener("change", (e) => {
  Native.setBiometric(e.target.checked);
  Native.toast(e.target.checked ? "Biometric unlock enabled (mock)." : "Biometric unlock disabled.");
});

/* ================= profile ================= */
function fillProfile() {
  $("#pf-name").value = ME.fullname;
  $("#pf-phone").value = ME.phone || ME.accountNumber;
  $("#pf-acc").value = ME.accountNumber;
  $("#pf-email").value = ME.email || "";
  $("#pf-bvn").value = ME.bvn || "2219#######";
}

$("#btn-save-profile").addEventListener("click", () => {
  const nm = $("#pf-name").value.trim();
  if (nm.length < 3) return Native.toast("Name too short.");
  ME.fullname = nm;
  ME.email = $("#pf-email").value.trim();
  saveLocalWallet(ME);
  renderGreeting();
  Native.toast("Profile saved.");
});

$("#btn-avatar").addEventListener("click", () => Native.pickAvatar());
window.onAvatarPicked = function () {
  const dataUrl = Native.consumePickedAvatar();
  if (!dataUrl) return;
  ME.avatar = dataUrl;
  saveLocalWallet(ME);
  renderGreeting();
  Native.toast("Avatar updated.");
};

/* ================= settings ================= */
function fillSettings() {
  const src = Native.paystackKeySource();
  $("#psk-default-warn").classList.toggle("hidden", src !== "");
  $("#psk-user-ok").classList.toggle("hidden", src !== "user");
  $("#psk-input").value = "";
  $("#psk-hint").textContent = Native.getPaystackKey() ? "Saved key: " + Native.getPaystackKey() : "No custom key saved.";
  $("#sender-id").textContent = Native.getSenderId();
  $("#app-version").textContent = Native.getAppVersion();
  $("#dark-toggle").checked = document.documentElement.getAttribute("data-theme") === "dark";
}

$("#btn-psk-save").addEventListener("click", () => {
  const k = $("#psk-input").value.trim();
  if (!k) return Native.toast("Paste a Paystack secret key first.");
  Native.setPaystackKey(k);
  banks = null;
  fillSettings();
  Native.toast("Paystack key saved on this device.");
});

$("#btn-psk-clear").addEventListener("click", () => {
  Native.clearPaystackKey();
  banks = null;
  fillSettings();
  Native.toast("Saved Paystack key cleared.");
});

$("#btn-logout").addEventListener("click", () => {
  Native.clearSession();
  ME = null;
  showScreen("auth");
});

/* ================= invest (demo) ================= */
function renderInvest() {
  const avail = ME.balance;
  $("#invest-available").textContent = "₦" + N(avail);
  const invested = (ME.transactions || []).filter((x) => x.type === "invested");
  $("#invest-list").innerHTML = invested.map((tx) =>
    '<li><div class="tx-ic">📈</div><div class="tx-main"><p class="tx-title">' + esc(tx.description) +
    '</p><p class="tx-sub">' + esc((tx.date || "").slice(0, 10)) + " · " + esc(tx.status) +
    '</p></div><p class="tx-amt pos">₦' + N(tx.amount) + '</p></li>').join("");
  $("#invest-empty").classList.toggle("hidden", invested.length > 0);
}
$("#invest-plans").addEventListener("click", (e) => {
  const b = e.target.closest(".plan");
  if (!b) return;
  const amt = Number(b.dataset.price);
  const label = b.dataset.label;
  if (!(amt > 0)) return;
  if (ME.balance < amt) return Native.toast("Insufficient balance.");
  askPin("Confirm investment", label + " ₦" + N(amt), (pin) => {
    if (pin !== ME.transactionPin) return Native.toast("Wrong PIN.");
    const t = nowParts();
    const txId = uid("INV");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "invested", amount: amt, description: label + " (demo)", date: t.iso, status: "active" });
    saveLocalWallet(ME);
    renderInvest();
    Native.toast("Investment started (demo).");
  });
});

/* ================= wire-up ================= */
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-nav]");
  if (nav) { e.preventDefault(); showView(nav.dataset.nav); return; }
  const goto = e.target.closest("[data-goto]");
  if (goto) { e.preventDefault(); showScreen(goto.dataset.goto); return; }
  const bs = e.target.closest("[data-bene-send]");
  if (bs) {
    showView("send");
    switchWalletTab("wallet");
    $("#wallet-dest").value = bs.dataset.beneSend;
    $("#btn-verify-wallet").click();
  }
});

bindPills("airtime-networks", null);
bindPills("data-networks", null);
bindPills("airtime-quick", (b) => { $("#airtime-amount").value = b.dataset.amt; });
bindPlans("data-plans", null);

/* balance hide/show */
$("#btn-eye").addEventListener("click", () => { hideBal = !hideBal; renderBalance(); });

/* notifications bell */
$("#btn-bell").addEventListener("click", () => showView("notifs"));

/* theme toggle */
$("#dark-toggle").addEventListener("change", (e) => applyTheme(e.target.checked ? "dark" : "light"));

/* ================= boot ================= */
window.addEventListener("DOMContentLoaded", boot);
