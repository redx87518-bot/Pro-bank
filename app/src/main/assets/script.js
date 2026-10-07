"use strict";

/* ================= helpers ================= */
const $ = (id) => document.getElementById(id);
const el = (sel, root) => (root || document).querySelector(sel);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': '&quot;',
  "'": "&#39;",
})[c]);
const uid = (p) => (p || "TXN") + "_" + Date.now();
const fmtN = (n) => Number(n || 0).toLocaleString("en-NG", {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
const now = () => {
  const d = new Date();
  return {
    iso: d.toISOString(),
    date: d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
  };
};
const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};
const digitsOnly = (s) => String(s == null ? "" : s).replace(/\D/g, "");

/* ================= native bridge ================= */
const Native = (() => {
  const hasNative = typeof GoldPayNative !== "undefined";
  const n = hasNative ? GoldPayNative : null;

  // browser-dev mirror so the web preview still works without the Kotlin bridge
  const store = {
    session: localStorage.getItem("opay_session") || "",
    theme: localStorage.getItem("opay_theme") || "light",
    biometric: localStorage.getItem("opay_biometric") === "1",
    paystackKey: localStorage.getItem("opay_paystack_key") || "",
    beneficiaries: localStorage.getItem("opay_beneficiaries") || "[]",
    contacts: localStorage.getItem("opay_contacts") || "{}",
  };

  return {
    getSession() {
      if (n) return n.getSession();
      return store.session;
    },
    setSession(phone) {
      if (n) { n.setSession(phone); return; }
      store.session = phone == null ? "" : String(phone);
      if (store.session) localStorage.setItem("opay_session", store.session);
      else localStorage.removeItem("opay_session");
    },
    clearSession() {
      if (n) { n.clearSession(); return; }
      store.session = "";
      localStorage.removeItem("opay_session");
    },
    getTheme() { return n ? n.getTheme() : store.theme; },
    setTheme(t) {
      if (n) { n.setTheme(t); return; }
      store.theme = t; localStorage.setItem("opay_theme", t);
    },
    getBiometric() { return n ? n.getBiometric() : store.biometric; },
    setBiometric(on) {
      if (n) { n.setBiometric(on); return; }
      store.biometric = !!on; localStorage.setItem("opay_biometric", on ? "1" : "0");
    },
    getPaystackKey() { return n ? n.getPaystackKey() : store.paystackKey; },
    setPaystackKey(k) {
      if (n) { n.setPaystackKey(k); return; }
      store.paystackKey = k || ""; localStorage.setItem("opay_paystack_key", store.paystackKey);
    },
    clearPaystackKey() {
      if (n) { n.clearPaystackKey(); return; }
      store.paystackKey = ""; localStorage.removeItem("opay_paystack_key");
    },
    paystackKeySource() { return n ? n.paystackKeySource() : (store.paystackKey ? "user" : ""); },
    getBanks() { return n ? n.getBanks() : JSON.stringify([{ code: "058", name: "GTBank" }, { code: "044", name: "Access Bank" }, { code: "999992", name: "Moniepoint MFB" }]); },
    resolveAccountName(acc, code) { return n ? n.resolveAccountName(acc, code) : "unknown"; },
    sendCreditSms(...args) { if (n) { n.sendCreditSms(...args); return; } console.log("[mock SMS]", args[0]); },
    accountToE164(a) { return n ? n.accountToE164(a) : (a && a.startsWith("019") ? "+234" + a.slice(3) : ""); },
    pickAvatar() { if (n) { n.pickAvatar(); return; } if (typeof window !== "undefined" && window.onAvatarPicked) window.onAvatarPicked(); },
    consumePickedAvatar() { return n ? n.consumePickedAvatar() : ""; },
    toast(m) { if (n) { n.toast(m); return; } alert(m); },
    haptic() { if (n) { n.haptic(); return; } },
    getSenderId() { return n ? n.getSenderId() : "OPay"; },
    getAppVersion() { return n ? n.getAppVersion() : "1.0"; },
  };
})();

/* ================= wallet persistence ================= */
const WALLET_STORE_KEY = "opay_wallet_v2";

function walletStore() {
  try { return JSON.parse(localStorage.getItem(WALLET_STORE_KEY) || "{}"); } catch (e) { return {}; }
}
function saveWalletStore(map) {
  localStorage.setItem(WALLET_STORE_KEY, JSON.stringify(map));
}
function loadWalletByAccount(account) {
  const store = walletStore();
  return store[account] || null;
}
function saveWalletByAccount(account, w) {
  const store = walletStore();
  store[account] = w;
  saveWalletStore(store);
}
function removeWalletByAccount(account) {
  const store = walletStore();
  delete store[account];
  saveWalletStore(store);
}
function allWalletAccounts() {
  return Object.keys(walletStore());
}

/* ================= state ================= */
let ME = null;
let hideBalance = false;

/* ================= screens ================= */
const SCREENS = {
  splash: "screen-splash",
  onboarding: "screen-onboarding",
  signup: "screen-signup",
  signin: "screen-signin",
  forgot: "screen-forgot",
  terms: "screen-terms",
  app: "screen-app",
};

function showScreen(name) {
  Object.values(SCREENS).forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", id === name);
  });
  if (name === "app") {
    document.body.classList.add("app-active");
  } else {
    document.body.classList.remove("app-active");
  }
}

/* ================= onboarding ================= */
let onboardIndex = 0;
const TOTAL_ONBOARD = 3;

function renderOnboardDots() {
  const dots = $("onboard-dots");
  if (!dots) return;
  dots.innerHTML = Array.from({ length: TOTAL_ONBOARD }, (_, i) =>
    `<span class="${i === onboardIndex ? "active" : ""}"></span>`
  ).join("");
}
function showOnboardStep() {
  const steps = document.querySelectorAll("#screen-onboarding .onboard-step");
  steps.forEach((s, i) => s.classList.toggle("hidden", i !== onboardIndex));
  renderOnboardDots();
  const next = $("onboard-next");
  if (next) next.textContent = onboardIndex === TOTAL_ONBOARD - 1 ? "Get started" : "Next";
}
function onboardNext() {
  if (onboardIndex < TOTAL_ONBOARD - 1) { onboardIndex++; showOnboardStep(); }
  else { goToSignup(); }
}
function onboardPrev() {
  if (onboardIndex > 0) { onboardIndex--; showOnboardStep(); }
}
function onboardSkip() { goToSignup(); }

/* ================= navigation ================= */
function goTo(name) { showScreen(name); }
function goToSignup() { showScreen(SCREENS.signup); }
function goToSignin() { showScreen(SCREENS.signin); }
function goToOnboarding() { onboardIndex = 0; showScreen(SCREENS.onboarding); showOnboardStep(); }
function goToApp() { showScreen(SCREENS.app); renderAppShell(); }

/* ================= boot ================= */
function boot() {
  applyTheme(Native.getTheme());
  const session = Native.getSession();
  if (session && loadWalletByAccount(session)) {
    ME = loadWalletByAccount(session);
    Native.setSession(ME.accountNumber);
    goToApp();
    return;
  }
  // first-time user experiences onboarding before sign-up
  goToOnboarding();
}
document.addEventListener("DOMContentLoaded", boot);

/* ================= theme ================= */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  Native.setTheme(t);
  const box = $("settings-dark");
  if (box) box.checked = t === "dark";
}
$("settings-dark").addEventListener("change", (e) => applyTheme(e.target.checked ? "dark" : "light"));

/* ================= onboarding wiring ================= */
$("onboard-next").addEventListener("click", onboardNext);
$("onboard-prev").addEventListener("click", onboardPrev);
document.querySelectorAll('[data-goto="onboarding-skip"]').forEach((b) => b.addEventListener("click", onboardSkip));

/* ================= sign-up ================= */
$("signup-back").addEventListener("click", goToOnboarding);
$("signup-submit").addEventListener("click", doSignup);
$('a[data-goto="signin"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); goToSignin(); }));
$('a[data-goto="terms"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); showScreen(SCREENS.terms); }));
$("terms-agree").addEventListener("click", () => goToSignup());

function doSignup() {
  const name = $("signup-name").value.trim();
  const phoneRaw = $("signup-phone").value;
  const phone = digitsOnly(phoneRaw);
  const pin = $("signup-password").value;
  const pin2 = $("signup-password2").value;
  const providedAccount = $("signup-account-number").value.trim();
  const terms = $("signup-terms").checked;

  if (!terms) { Native.toast("Please agree to the demo terms."); return; }
  if (name.length < 2) { Native.toast("Enter your full name."); return; }
  if (phone.length !== 10 || phone.startsWith("0")) { Native.toast("Phone must be 10 digits without leading 0."); return; }
  if (!/^[0-9]{4}$/.test(pin)) { Native.toast("PIN must be 4 digits."); return; }
  if (pin !== pin2) { Native.toast("PINs do not match."); return; }

  let account;
  if (providedAccount) {
    const digits = digitsOnly(providedAccount);
    if (!/^019[0-9]{10}$/.test(digits)) { Native.toast("Preferred account must be 13 digits starting with 019."); return; }
    if (loadWalletByAccount(digits)) { Native.toast("That account number is already taken."); return; }
    account = digits;
  } else {
    account = "019" + phone;
    if (loadWalletByAccount(account)) {
      // rare collision; offer a deterministic variant
      account = "019" + phone + "01";
    }
  }

  const user = {
    id: uid("USER"),
    name: name,
    phone: phone,
    accountNumber: account,
    pin: pin,
    email: "",
    avatarInitials: initials(name),
    balance: 0,
    transactions: [],
    notifications: [],
    savedCards: [],
    beneficiaries: [],
    createdAt: now().iso,
  };

  // welcome bonus for registration (demo)
  const bonus = 5000000;
  user.balance = bonus;
  const t = now();
  user.transactions.push({
    id: uid("BONUS"),
    type: "received",
    amount: bonus,
    description: "Welcome bonus",
    date: t.iso,
    status: "successful",
  });

  saveWalletByAccount(account, user);
  ME = user;
  Native.setSession(account);
  Native.toast("Account created. ₦5,000,000 demo bonus credited.");
  goToApp();
}

/* ================= sign-in ================= */
$("signin-back").addEventListener("click", goToOnboarding);
$("signin-submit").addEventListener("click", doSignin);
$('a[data-goto="forgot"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); showScreen(SCREENS.forgot); }));
$("forgot-back").addEventListener("click", goToSignin);
$("forgot-submit").addEventListener("click", () => {
  Native.toast("In the live app, a PIN reset link would be sent to your phone. This is a demo placeholder.");
});
$('a[data-goto="signup"]').forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); goToSignup(); }));

function doSignin() {
  const phoneRaw = $("signin-phone").value;
  const phone = digitsOnly(phoneRaw);
  const pin = $("signin-password").value;

  if (phone.length !== 10 || phone.startsWith("0")) { Native.toast("Enter a valid 10-digit phone number."); return; }
  if (!/^[0-9]{4}$/.test(pin)) { Native.toast("Enter your 4-digit PIN."); return; }

  const account = "019" + phone;
  const user = loadWalletByAccount(account);
  if (!user) { Native.toast("No account found for that phone number."); return; }
  if (user.pin !== pin) { Native.toast("Incorrect PIN."); return; }

  ME = user;
  Native.setSession(account);
  Native.toast("Signed in.");
  goToApp();
}

/* ================= app shell render ================= */
function renderAppShell() {
  if (!ME) { goToSignin(); return; }
  if (typeof Native !== "undefined" && Native.getBiometric) {
    $("security-biometric").checked = !!Native.getBiometric();
  }
$("app-greet").textContent = greeting();
  $("app-name").textContent = ME.name || "OPay user";
  $("app-avatar-top").textContent = ME.avatarInitials || initials(ME.name);
  $("profile-avatar").textContent = ME.avatarInitials || initials(ME.name);
  renderHome();
  renderRecent();
  renderHistory();
  renderNotifications();
  renderSavedCards("transfer-card-list");
  renderSavedCards("addmoney-card-list");
  renderSavedCards("profile-card-list");
  renderSavings();
  renderFaq();
  fillProfileForm();
  fillPaystackForm();
  fillBankSelects();
  $("profile-sender-id").textContent = Native.getSenderId();
  $("profile-version").textContent = Native.getAppVersion();
}

function renderHome() {

  // home extras
  const homeStats = $("home-stats");
  if (homeStats) {
    const txCount = (ME.transactions || []).length;
    const sentCount = (ME.transactions || []).filter((x) => x.type === "sent").length;
    const receivedCount = (ME.transactions || []).filter((x) => x.type === "received").length;
    homeStats.innerHTML = `
      <div class="stat-chip"><span class="stat-num">${txCount}</span><span class="stat-label">Transactions</span></div>
      <div class="stat-chip"><span class="stat-num">${sentCount}</span><span class="stat-label">Sent</span></div>
      <div class="stat-chip"><span class="stat-num">${receivedCount}</span><span class="stat-label">Received</span></div>
    `;
  }
  $("home-balance").textContent = hideBalance ? "₦ ••••••" : "₦" + fmtN(ME.balance);
  $("home-account").textContent = ME.accountNumber;
  $("home-eye-icon").textContent = hideBalance ? "🚫" : "👁";
}
$("home-eye-btn").addEventListener("click", () => {
  hideBalance = !hideBalance;
  renderHome();
});

/* ================= recent / history / notifications ================= */
function renderRecent() {
  const list = $("home-recent");
  if (!list) return;
  const recent = (ME.transactions || []).slice(0, 5).reverse();
  list.innerHTML = recent.length ? recent.map(txRow).join("") : `<li><p class="empty-msg">No activity yet.</p></li>`;
}
function renderHistory() {
  const list = $("history-list");
  if (!list) return;
  const all = (ME.transactions || []).slice().reverse();
  list.innerHTML = all.length ? all.map(txRow).join("") : `<li><p class="empty-msg">No transactions yet.</p></li>`;
}
function renderNotifications() {
  const list = $("notifications-list");
  if (!list) return;
  const all = (ME.notifications || []).slice().reverse();
  list.innerHTML = all.length ? all.map(n => `
    <li>
      <div class="tx-icon">🔔</div>
      <div class="tx-body">
        <div class="tx-title">${esc(n.title || "Notification")}</div>
        <div class="tx-sub">${esc(n.body || "")}</div>
      </div>
      <div class="tx-time">${timeOnly(n.date)}</div>
    </li>
  `).join("") : `<li><p class="empty-msg">No notifications yet.</p></li>`;
}

function txRow(tx) {
  const incoming = tx.type === "received";
  const icon = incoming ? "⬇️" : (tx.description && tx.description.toLowerCase().includes("bonus") ? "🎁" : "⬆️");
  const amtClass = incoming ? "pos" : "neg";
  const sign = incoming ? "+" : "−";
  return `
    <li>
      <div class="tx-icon">${icon}</div>
      <div class="tx-body">
        <div class="tx-title">${esc(tx.description || "")}</div>
        <div class="tx-sub">${esc((tx.date || "").slice(0, 10))} · ${esc(tx.status || "successful")}</div>
      </div>
      <div class="tx-amount ${amtClass}">${sign}₦${fmtN(tx.amount)}</div>
    </li>
  `;
}
function timeOnly(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

/* ================= bottom nav ================= */
document.querySelectorAll(".bottom-nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.nav;
    document.querySelectorAll(".bottom-nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.nav === name));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
    if (name === "home") renderHome();
    if (name === "history") renderHistory();
    if (name === "notifications") renderNotifications();
    if (name === "profile") fillProfileForm();
  });
});

/* ================= transfer ================= */
let transferTab = "person";
let transferPersonTarget = null;

function setTransferTab(tab) {
  transferTab = tab;
  document.querySelectorAll("#transfer-tabs .segment").forEach((s) => s.classList.toggle("active", s.dataset.transferTab === tab));
  document.getElementById("transfer-panel-person").classList.toggle("hidden", tab !== "person");
  document.getElementById("transfer-panel-bank").classList.toggle("hidden", tab !== "bank");
  document.getElementById("transfer-panel-card").classList.toggle("hidden", tab !== "card");
}
document.querySelectorAll("#transfer-tabs .segment").forEach((s) => s.addEventListener("click", () => setTransferTab(s.dataset.transferTab)));
setTransferTab("person");

$("transfer-bank-verify").addEventListener("click", () => {
  const acc = digitsOnly($("transfer-bank-account").value);
  const code = $("transfer-bank-bank").value;
  const box = $("transfer-bank-verified");
  if (!acc || acc.length < 10 || !code) {
    box.classList.remove("hidden");
    box.textContent = "Enter a 10-digit account and select a bank.";
    return;
  }
  const name = Native.resolveAccountName(acc, code);
  const bankName = currentBankName(code);
  box.classList.remove("hidden");
  box.textContent = name === "unknown" ? `Name unavailable · ${bankName}` : `${name} · ${bankName}`;
  transferPersonTarget = { type: "bank", account: acc, name: name === "unknown" ? null : name, bankCode: code, bankName };
});
$("transfer-submit").addEventListener("click", () => {
  if (transferTab === "person") {
    const search = $("transfer-person-search").value.trim().toLowerCase();
    if (!search) {
      // simple local recipient picker: pick first saved beneficiary or a local wallet
      const bene = nextBeneficiary();
      if (bene) {
        transferPersonTarget = { type: "person", account: bene.accountNumber, name: bene.name };
        $("transfer-person-search").value = bene.accountNumber;
      } else {
        Native.toast("Search for a person or choose a beneficiary first.");
        return;
      }
    } else {
      const target = resolvePersonSearch(search);
      if (!target) { Native.toast("No recipient found for that search."); return; }
      transferPersonTarget = target;
    }
  }
  if (transferTab === "bank") {
    const acc = digitsOnly($("transfer-bank-account").value);
    const code = $("transfer-bank-bank").value;
    if (!acc || acc.length < 10 || !code || !$("transfer-bank-verified").classList.contains("hidden") === false) {
      if ($("transfer-bank-verified").classList.contains("hidden")) Native.toast("Verify the account name first.");
      return;
    }
    const name = Native.resolveAccountName(acc, code);
    transferPersonTarget = { type: "bank", account: acc, name: name === "unknown" ? null : name, bankCode: code };
  }
  if (!transferPersonTarget) { Native.toast("No recipient selected."); return; }
  const amt = Number($("transfer-amount").value);
  if (!amt || amt <= 0) { Native.toast("Enter an amount."); return; }
  if (ME.balance < amt) { Native.toast("Insufficient balance."); return; }
  if (transferPersonTarget.account === ME.accountNumber) { Native.toast("You cannot send to yourself."); return; }
  askPin("Confirm transfer", `₦${fmtN(amt)} to ${transferPersonTarget.name || transferPersonTarget.account}`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("TXN");
    const recipient = loadWalletByAccount(transferPersonTarget.account);
    if (!recipient) { Native.toast("Recipient wallet not found."); return; }
    ME.balance -= amt;
    recipient.balance = (recipient.balance || 0) + amt;
    const outgoing = {
      id: txId, type: "sent", amount: amt,
      description: `Sent to ${recipient.name || recipient.accountNumber}`,
      narration: $("transfer-narration").value,
      date: t.iso, status: "successful",
    };
    const incoming = {
      id: txId, type: "received", amount: amt,
      description: `Received from ${ME.name || ME.accountNumber}`,
      narration: $("transfer-narration").value,
      date: t.iso, status: "successful",
    };
    ME.transactions.unshift(outgoing);
    recipient.transactions.unshift(incoming);
    const notif = { title: "Credit alert", body: `₦${fmtN(amt)} from ${ME.name || ME.accountNumber}` };
    recipient.notifications.unshift(notif);
    saveWalletByAccount(transferPersonTarget.account, recipient);
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    addBeneficiary(recipient.accountNumber, recipient.name);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    const e164 = Native.accountToE164(recipient.accountNumber);
    if (e164) {
      Native.sendCreditSms(e164, fmtN(amt), ME.name || ME.accountNumber, ME.accountNumber, t.date, t.time, "Transfer", fmtN(recipient.balance), txId);
    }
    showReceipt({ amount: amt, recipient: `${recipient.name || recipient.accountNumber} (${recipient.accountNumber})`, product: "Transfer", date: t.date, time: t.time, reference: txId });
    $("transfer-amount").value = "";
    $("transfer-narration").value = "";
    $("transfer-person-search").value = "";
    transferPersonTarget = null;
  });
});

function resolvePersonSearch(search) {
  const lower = search.toLowerCase();
  // try exact account match first
  const byAccount = allWalletAccounts().find((a) => a.toLowerCase() === lower);
  if (byAccount) {
    const w = loadWalletByAccount(byAccount);
    if (w && w.accountNumber !== ME.accountNumber) return { type: "person", account: w.accountNumber, name: w.name };
  }
  // try phone match (019 + 10 digits)
  const phone = digitsOnly(search);
  if (phone.length === 10) {
    const acc = "019" + phone;
    const w = loadWalletByAccount(acc);
    if (w && w.accountNumber !== ME.accountNumber) return { type: "person", account: w.accountNumber, name: w.name };
  }
  if (phone.length === 13 && phone.startsWith("019")) {
    const w = loadWalletByAccount(phone);
    if (w && w.accountNumber !== ME.accountNumber) return { type: "person", account: w.accountNumber, name: w.name };
  }
  // try name match
  const matched = allWalletAccounts().find((a) => {
    const w = loadWalletByAccount(a);
    return w && w.name && w.name.toLowerCase().includes(lower) && w.accountNumber !== ME.accountNumber;
  });
  if (matched) {
    const w = loadWalletByAccount(matched);
    return { type: "person", account: w.accountNumber, name: w.name };
  }
  return null;
}
function nextBeneficiary() {
  const list = beneficiariesList();
  return list[0] || null;
}
function beneficiariesList() {
  try { return JSON.parse(Native.getBeneficiaries ? Native.getBeneficiaries() : "[]"); } catch (e) { return []; }
}
function addBeneficiary(account, name) {
  const list = beneficiariesList().filter((b) => b.accountNumber !== account);
  list.unshift({ accountNumber: account, name: name || account });
  if (Native.setBeneficiaries) Native.setBeneficiaries(JSON.stringify(list.slice(0, 50)));
}
function initials(name) {
  if (!name) return "OP";
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "OP";
}

/* ================= airtime ================= */
$("airtime-submit").addEventListener("click", () => {
  const network = $("airtime-network").value;
  const phone = digitsOnly($("airtime-phone").value);
  let amt = Number($("airtime-amount").value);
  if (!phone || phone.length < 10) { Native.toast("Enter a valid phone number."); return; }
  if (!amt || amt <= 0) { Native.toast("Enter an amount."); return; }
  if (ME.balance < amt) { Native.toast("Insufficient balance."); return; }
  askPin("Confirm airtime", `${network} airtime — ₦${fmtN(amt)} to ${phone}`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("AIR");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: `${network} Airtime — ${phone}`, date: t.iso, status: "successful" });
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    showReceipt({ amount: amt, recipient: phone, product: `${network} Airtime`, date: t.date, time: t.time, reference: txId });
    $("airtime-amount").value = "";
  });
});
document.querySelectorAll("#airtime-quick .pill").forEach((p) => p.addEventListener("click", () => {
  $("airtime-amount").value = p.dataset.at;
}));

/* ================= data ================= */
$("data-submit").addEventListener("click", () => {
  const network = $("data-network").value;
  const phone = digitsOnly($("data-phone").value);
  const plan = el(".plan-grid .plan.active", $("data-plans"));
  if (!phone || phone.length < 10) { Native.toast("Enter a valid phone number."); return; }
  if (!plan) { Native.toast("Pick a data plan."); return; }
  const amt = Number(plan.dataset.price);
  if (ME.balance < amt) { Native.toast("Insufficient balance."); return; }
  askPin("Confirm data", `${plan.dataset.planLabel} for ${phone}`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("DATA");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: `${plan.dataset.planLabel} — ${phone}`, date: t.iso, status: "successful" });
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    showReceipt({ amount: amt, recipient: phone, product: plan.dataset.planLabel, date: t.date, time: t.time, reference: txId });
    $("data-phone").value = "";
  });
});
document.querySelectorAll("#data-plans .plan").forEach((p) => p.addEventListener("click", () => {
  document.querySelectorAll("#data-plans .plan").forEach((x) => x.classList.toggle("active", x === p));
}));

/* ================= bills ================= */
function setupBillsTabs() {
  document.querySelectorAll("#bills-tabs .segment").forEach((s) => {
    s.addEventListener("click", () => {
      document.querySelectorAll("#bills-tabs .segment").forEach((x) => x.classList.toggle("active", x === s));
      document.querySelectorAll(".bills-panel").forEach((p) => p.classList.add("hidden"));
      const tab = s.dataset.billsTab;
      const target = document.getElementById("bills-panel-" + tab);
      if (target) target.classList.remove("hidden");
    });
  });
}
setupBillsTabs();

$("bills-airtime-submit").addEventListener("click", () => {
  const network = $("bills-airtime-network").value;
  const phone = digitsOnly($("bills-airtime-phone").value);
  let amt = Number($("bills-airtime-amount").value);
  if (!phone || phone.length < 10) { Native.toast("Enter a valid phone number."); return; }
  if (!amt || amt <= 0) { Native.toast("Enter an amount."); return; }
  if (ME.balance < amt) { Native.toast("Insufficient balance."); return; }
  askPin("Confirm airtime", `${network} airtime — ₦${fmtN(amt)} to ${phone}`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("BILLS-AIR");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: `${network} Airtime — ${phone}`, date: t.iso, status: "successful" });
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    showReceipt({ amount: amt, recipient: phone, product: `${network} Airtime`, date: t.date, time: t.time, reference: txId });
    $("bills-airtime-amount").value = "";
  });
});

$("bills-data-submit").addEventListener("click", () => {
  const network = $("bills-data-network").value;
  const phone = digitsOnly($("bills-data-phone").value);
  const plan = el(".plan-grid .plan.active", $("bills-data-plans"));
  if (!phone || phone.length < 10) { Native.toast("Enter a valid phone number."); return; }
  if (!plan) { Native.toast("Pick a data plan."); return; }
  const amt = Number(plan.dataset.price);
  if (ME.balance < amt) { Native.toast("Insufficient balance."); return; }
  askPin("Confirm data", `${plan.dataset.planLabel} for ${phone}`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("BILLS-DATA");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: `${plan.dataset.planLabel} — ${phone}`, date: t.iso, status: "successful" });
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    showReceipt({ amount: amt, recipient: phone, product: plan.dataset.planLabel, date: t.date, time: t.time, reference: txId });
    $("bills-data-phone").value = "";
  });
});

$("bills-electricity-verify").addEventListener("click", () => {
  const meter = digitsOnly($("bills-electricity-meter").value);
  const disco = $("bills-electricity-disco").value;
  const box = $("bills-electricity-verified");
  if (meter.length < 6) { box.classList.remove("hidden"); box.textContent = "Enter a valid meter number."; return; }
  const names = ["ADAMU IBRAHIM", "CHIOMA OKEKE", "FOLARIN BALOGUN", "AISHA BELLO", "EMEKA NWACHUKWU"];
  box.classList.remove("hidden");
  box.textContent = `${names[meter.length % names.length]} · ${disco}`;
});
$("bills-electricity-submit").addEventListener("click", () => {
  const meter = digitsOnly($("bills-electricity-meter").value);
  const disco = $("bills-electricity-disco").value;
  let amt = Number($("bills-electricity-amount").value);
  if (meter.length < 6) { Native.toast("Verify the meter number first."); return; }
  if (!amt || amt <= 0) { Native.toast("Enter an amount."); return; }
  if (ME.balance < amt) { Native.toast("Insufficient balance."); return; }
  askPin("Confirm payment", `${disco} · Meter ${meter} — ₦${fmtN(amt)}`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("BILLS-PWR");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: `${disco} Electricity — Meter ${meter}`, date: t.iso, status: "successful" });
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    showReceipt({ amount: amt, recipient: `Meter ${meter}`, product: `${disco} Electricity`, date: t.date, time: t.time, reference: txId });
    $("bills-electricity-amount").value = "";
  });
});

$("bills-cable-verify").addEventListener("click", () => {
  const sc = digitsOnly($("bills-cable-smartcard").value);
  const box = $("bills-cable-verified");
  if (sc.length < 6) { box.classList.remove("hidden"); box.textContent = "Enter a valid smartcard number."; return; }
  const names = ["THE OJO FAMILY", "MUSA DANLADI", "GRACE EMEKA", "SANI MUSA"];
  box.classList.remove("hidden");
  box.textContent = names[sc.length % names.length];
});
$("bills-cable-submit").addEventListener("click", () => {
  const sc = digitsOnly($("bills-cable-smartcard").value);
  const provider = $("bills-cable-provider").value;
  const bouquet = $("bills-cable-bouquet").value.split("|");
  const amt = Number(bouquet[1]);
  if (sc.length < 6) { Native.toast("Verify the smartcard first."); return; }
  if (!amt) { Native.toast("Select a bouquet."); return; }
  if (ME.balance < amt) { Native.toast("Insufficient balance."); return; }
  askPin("Confirm payment", `${provider} · ${bouquet[0]} — ₦${fmtN(amt)}`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("BILLS-TV");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: `${provider} ${bouquet[0]} — Smartcard ${sc}`, date: t.iso, status: "successful" });
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    showReceipt({ amount: amt, recipient: `Smartcard ${sc}`, product: `${provider} ${bouquet[0]}`, date: t.date, time: t.time, reference: txId });
    $("bills-cable-smartcard").value = "";
  });
});

$("bills-internet-submit").addEventListener("click", () => {
  const account = $("bills-internet-account").value.trim();
  const plan = $("bills-internet-plan").value.split("|");
  const amt = Number(plan[1]);
  if (!account) { Native.toast("Enter the account / student ID."); return; }
  if (!amt) { Native.toast("Select a plan."); return; }
  if (ME.balance < amt) { Native.toast("Insufficient balance."); return; }
  askPin("Confirm payment", `${plan[0]} — ₦${fmtN(amt)}`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("BILLS-INT");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "sent", amount: amt, description: `${plan[0]} — ${account}`, date: t.iso, status: "successful" });
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    showReceipt({ amount: amt, recipient: account, product: plan[0], date: t.date, time: t.time, reference: txId });
    $("bills-internet-account").value = "";
  });
});

/* ================= add money ================= */
let addmoneyTab = "bank";
function setAddmoneyTab(tab) {
  addmoneyTab = tab;
  document.querySelectorAll("#addmoney-tabs .segment").forEach((s) => s.classList.toggle("active", s.dataset.addmoneyTab === tab));
  document.getElementById("addmoney-panel-bank").classList.toggle("hidden", tab !== "bank");
  document.getElementById("addmoney-panel-card").classList.toggle("hidden", tab !== "card");
}
document.querySelectorAll("#addmoney-tabs .segment").forEach((s) => s.addEventListener("click", () => setAddmoneyTab(s.dataset.addmoneyTab)));
setAddmoneyTab("bank");

$("addmoney-source-verify").addEventListener("click", () => {
  const acc = digitsOnly($("addmoney-source-account").value);
  const code = $("addmoney-source-bank").value;
  const box = $("addmoney-source-verified");
  if (!acc || acc.length < 10 || !code) {
    box.classList.remove("hidden");
    box.textContent = "Enter a 10-digit account and select a bank.";
    return;
  }
  const name = Native.resolveAccountName(acc, code);
  const bankName = currentBankName(code);
  box.classList.remove("hidden");
  box.textContent = name === "unknown" ? `Name unavailable · ${bankName}` : `${name} · ${bankName}`;
});
$("addmoney-submit").addEventListener("click", () => {
  const acc = digitsOnly($("addmoney-source-account").value);
  const code = $("addmoney-source-bank").value;
  let amt = Number($("addmoney-amount").value);
  if (!acc || acc.length < 10 || !code) { Native.toast("Verify your bank account first."); return; }
  if (!amt || amt <= 0) { Native.toast("Enter an amount."); return; }
  if ($("addmoney-source-verified").classList.contains("hidden")) { Native.toast("Verify your bank account first."); return; }
  if (ME.balance + amt < amt) { Native.toast("Insufficient balance for this deposit simulation."); return; }
  askPin("Confirm deposit", `₦${fmtN(amt)} from bank account`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("ADD");
    ME.balance += amt;
    ME.transactions.unshift({ id: txId, type: "received", amount: amt, description: `Deposited from ${currentBankName(code)} account`, date: t.iso, status: "successful" });
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    showReceipt({ amount: amt, recipient: ME.name || ME.accountNumber, product: "Bank deposit", date: t.date, time: t.time, reference: txId });
    $("addmoney-amount").value = "";
  });
});

/* ================= savings ================= */
function renderSavings() {
  $("savings-available").textContent = fmtN(ME.balance);
  const list = $("savings-list");
  if (!list) return;
  const items = (ME.transactions || []).filter((tx) => tx.type === "savings");
  list.innerHTML = items.length ? items.map((tx) => `
    <li>
      <div class="tx-icon">📈</div>
      <div class="tx-body">
        <div class="tx-title">${esc(tx.description || "Savings")}</div>
        <div class="tx-sub">${esc((tx.date || "").slice(0, 10))} · ${esc(tx.status || "active")}</div>
      </div>
      <div class="tx-amount pos">₦${fmtN(tx.amount)}</div>
    </li>
  `).join("") : `<li><p class="empty-msg">No savings yet.</p></li>`;
  $("savings-empty").classList.toggle("hidden", items.length > 0);
}
document.querySelectorAll("#savings-plans .plan").forEach((p) => p.addEventListener("click", () => {
  document.querySelectorAll("#savings-plans .plan").forEach((x) => x.classList.toggle("active", x === p));
  $("addmoney-amount").value = "";
}));
document.querySelectorAll("#savings-plans .plan").forEach((p) => p.addEventListener("click", () => {
  // activate only
  document.querySelectorAll("#savings-plans .plan").forEach((x) => x.classList.toggle("active", x === p));
}));
/* savings submit is on profile? no — use a dedicated quick action from home? For simplicity, allow savings via a small form in the savings view. */
const savingsSubmit = document.createElement("button");
savingsSubmit.className = "btn primary";
savingsSubmit.textContent = "Save now";
savingsSubmit.addEventListener("click", () => {
  const plan = el(".plan-grid .plan.active", $("savings-plans"));
  if (!plan) { Native.toast("Pick a savings plan."); return; }
  const amt = Number(plan.dataset.price);
  if (amt > ME.balance) { Native.toast("Insufficient balance."); return; }
  askPin("Confirm savings", `₦${fmtN(amt)} savings plan`, (pin) => {
    if (pin !== ME.pin) { Native.toast("Incorrect PIN."); return; }
    const t = now();
    const txId = uid("SAV");
    ME.balance -= amt;
    ME.transactions.unshift({ id: txId, type: "savings", amount: amt, description: plan.dataset.planLabel, date: t.iso, status: "active" });
    saveWalletByAccount(ME.accountNumber, ME);
    ME = loadWalletByAccount(ME.accountNumber);
    renderHome(); renderRecent(); renderHistory(); renderSavings();
    showReceipt({ amount: amt, recipient: "Savings plan", product: plan.dataset.planLabel, date: t.date, time: t.time, reference: txId });
  });
});
const savingsHead = $("view-invest").querySelector(".section-head:last-of-type") || $("view-invest").querySelector(".section-head");
if (savingsHead) {
  const wrapper = savingsHead.parentNode;
  wrapper.insertBefore(savingsSubmit, savingsHead.nextSibling);
}

/* ================= profile ================= */
function fillProfileForm() {
  if (!ME) return;
  $("profile-name").value = ME.name || "";
  $("profile-phone").value = ME.phone || ME.accountNumber.replace(/^0+/, "");
  $("profile-account").value = ME.accountNumber;
  $("profile-email").value = ME.email || "";
}
$("profile-avatar-btn").addEventListener("click", () => Native.pickAvatar());
window.onAvatarPicked = function () {
  const dataUrl = Native.consumePickedAvatar();
  if (!dataUrl) return;
  ME.avatar = dataUrl;
  saveWalletByAccount(ME.accountNumber, ME);
  const img = $("profile-avatar");
  if (img) img.src = dataUrl;
  Native.toast("Photo updated.");
};
$("profile-save").addEventListener("click", () => {
  const name = $("profile-name").value.trim();
  if (name.length < 2) { Native.toast("Name is too short."); return; }
  ME.name = name;
  ME.email = $("profile-email").value.trim();
  ME.avatarInitials = initials(name);
  saveWalletByAccount(ME.accountNumber, ME);
  renderAppShell();
  Native.toast("Profile saved.");
});
$("profile-logout").addEventListener("click", () => {
  Native.clearSession();
  ME = null;
  showScreen(SCREENS.signin);
});

/* ================= security ================= */
$("security-change-pin").addEventListener("click", () => {
  const oldPin = $("security-old-pin").value;
  const newPin = $("security-new-pin").value;
  const newPin2 = $("security-new-pin2").value;
  if (oldPin !== ME.pin) { Native.toast("Current PIN is incorrect."); return; }
  if (!/^[0-9]{4}$/.test(newPin)) { Native.toast("New PIN must be 4 digits."); return; }
  if (newPin !== newPin2) { Native.toast("New PINs do not match."); return; }
  ME.pin = newPin;
  saveWalletByAccount(ME.accountNumber, ME);
  $("security-old-pin").value = "";
  $("security-new-pin").value = "";
  $("security-new-pin2").value = "";
  Native.toast("PIN changed.");
});
$("security-biometric").addEventListener("change", (e) => {
  Native.setBiometric(e.target.checked);
  Native.toast(e.target.checked ? "Biometric unlock enabled (demo)." : "Biometric unlock disabled.");
});

/* ================= paystack ================= */
function fillPaystackForm() {
  const hint = $("paystack-hint");
  if (!hint) return;
  const saved = Native.getPaystackKey();
  hint.textContent = saved ? `Saved key: ${saved}` : "No custom key saved.";
  $("paystack-key-input").value = "";
}
  const src = Native.paystackKeySource();
  const srcEl = $("paystack-source");
  if (srcEl) srcEl.textContent = src === "user" ? "Saved on device" : src === "default" ? "Default key" : "None";

$("paystack-save").addEventListener("click", () => {
  const k = $("paystack-key-input").value.trim();
  if (!k) { Native.toast("Paste a Paystack secret key first."); return; }
  Native.setPaystackKey(k);
  fillPaystackForm();
  fillBankSelects();
  Native.toast("Paystack key saved on this device.");
});
$("paystack-clear").addEventListener("click", () => {
  Native.clearPaystackKey();
  fillPaystackForm();
  fillBankSelects();
  Native.toast("Saved Paystack key cleared.");
});

/* ================= bank selects ================= */
function fillBankSelects() {
  const banks = parseBanks(Native.getBanks());
  ["transfer-bank-bank", "addmoney-source-bank"].forEach((id) => {
    const sel = $(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = banks.map((b) => `<option value="${esc(b.code)}">${esc(b.name)}</option>`).join("");
    if (current && banks.some((b) => b.code === current)) sel.value = current;
  });
}
function currentBankName(code) {
  const banks = parseBanks(Native.getBanks());
  const b = banks.find((x) => x.code === code);
  return b ? b.name : code;
}
function parseBanks(json) {
  try { return JSON.parse(json || "[]"); } catch (e) { return []; }
}

/* ================= PIN modal ================= */
let pinCallback = null;
function askPin(title, sub, cb) {
  $("modal-pin-title").textContent = title || "Confirm PIN";
  $("modal-pin-sub").textContent = sub || "Enter your PIN to continue.";
  $("modal-pin-input").value = "";
  $("modal-pin").classList.remove("hidden");
  pinCallback = cb;
}
$("modal-pin-ok").addEventListener("click", () => {
  const v = $("modal-pin-input").value;
  if (!/^[0-9]{4}$/.test(v)) { Native.toast("Enter your 4-digit PIN."); return; }
  $("modal-pin").classList.add("hidden");
  const cb = pinCallback; pinCallback = null;
  if (cb) cb(v);
});
$("modal-pin-cancel").addEventListener("click", () => {
  $("modal-pin").classList.add("hidden");
  pinCallback = null;
});
$("modal-pin-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("modal-pin-ok").click();
});

/* ================= receipt modal ================= */
function showReceipt(r) {
  $("receipt-amount").textContent = "₦" + fmtN(r.amount);
  $("receipt-recipient").textContent = r.recipient || "—";
  $("receipt-product").textContent = r.product || "—";
  $("receipt-date").textContent = r.date || "";
  $("receipt-time").textContent = r.time || "";
  $("receipt-reference").textContent = r.reference || uid("REC");
  $("receipt-total").textContent = "₦" + fmtN(r.amount);
  $("modal-receipt").classList.remove("hidden");
  Native.haptic && Native.haptic();
}
$("receipt-done").addEventListener("click", () => {
  $("modal-receipt").classList.add("hidden");
  renderHome();
});

/* ================= global link wiring ================= */
document.querySelectorAll("[data-goto]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    const target = el.dataset.goto;
    if (target === "signin") goToSignin();
    else if (target === "signup") goToSignup();
    else if (target === "terms") showScreen(SCREENS.terms);
    else if (target === "forgot") showScreen(SCREENS.forgot);
    else if (target === "onboarding-skip") onboardSkip();
  });
});

/* ================= empty-state styling helper ================= */
const style = document.createElement("style");
style.textContent = `
  .empty-msg { color: var(--ink-soft); font-size: 13px; padding: 8px 0; text-align: center; }
  .tx-time { font-size: 11px; color: var(--ink-soft); }
`;
document.head.appendChild(style);


  const summary = $("transfer-summary");
  if (summary && transferPersonTarget) {
    savingsSummary.classList.remove("hidden");
    savingsSummary.innerHTML = `
      <div class="summary-row"><span>Recipient</span><b>${esc(transferPersonTarget.name || transferPersonTarget.account)}</b></div>
      <div class="summary-row"><span>Channel</span><b>${esc(transferPersonTarget.type === "bank" ? "Bank account" : "OPay wallet")}</b></div>
    `;
  } else if (savingsSummary) {
    savingsSummary.classList.add("hidden");
  }



  const savingsSummary = $("savings-summary");
  if (savingsSummary) {
    const saved = (ME.transactions || []).filter((x) => x.type === "savings").reduce((a, x) => a + (x.amount || 0), 0);
    const active = (ME.transactions || []).filter((x) => x.type === "savings" && (x.status || "") === "active").length;
    savingsSummary.innerHTML = `
      <div class="summary-row"><span>Total saved</span><b>₦${fmtN(saved)}</b></div>
      <div class="summary-row"><span>Active plans</span><b>${active}</b></div>
    `;
  }



  const addmoneySummary = $("addmoney-summary");
  if (addmoneySummary && !$("addmoney-source-verified").classList.contains("hidden")) {
    savingsSummary.classList.remove("hidden");
  } else if (savingsSummary) {
    savingsSummary.classList.add("hidden");
  }



function renderFaq() {
  const list = $("faq-list");
  if (!list) return;
  const items = faqItems();
  if (!items.length) {
    $("faq-empty").classList.remove("hidden");
    return;
  }
  $("faq-empty").classList.add("hidden");
  list.innerHTML = items.map((f, i) => `
    <div class="faq-item" data-faq-index="${i}">
      <div class="faq-q"><span>${esc(f.q)}</span><span class="chevron">▾</span></div>
      <div class="faq-a">${esc(f.a)}</div>
    </div>
  `).join("");
  list.querySelectorAll(".faq-item").forEach((item) => {
    item.addEventListener("click", () => {
      const wasOpen = item.classList.contains("open");
      list.querySelectorAll(".faq-item").forEach((x) => x.classList.remove("open"));
      if (!wasOpen) item.classList.add("open");
    });
  });
}
const faqItems = () => [
  { q: "How do I create an account?", a: "Open the app, tap Create account, enter your full name and phone number, set a PIN, then submit. A demo account number is created for you." },
  { q: "Is my phone number visible to others?", a: "No. Your phone number is used only to create and access your own account in this demo." },
  { q: "How does transfer work?", a: "Tap Transfer, choose Person, Bank, or Card, select a recipient, enter an amount and optional narration, then confirm your PIN." },
  { q: "Can I send money to a bank account?", a: "Yes. Choose Bank, select the bank and account number, verify the name, then continue. Bank name lookups use your saved Paystack key if you provided one." },
  { q: "How do I add money?", a: "Go to Add money, choose Bank transfer or Card, select your source bank and account, verify the name, enter an amount, and deposit." },
  { q: "Is this real money?", a: "No. This is a demo for educational purposes. All balances, transfers, airtime, data, and bills are simulated." },
  { q: "How do I reset my PIN?", a: "Use the Forgot PIN link on the sign-in screen. In the live app this sends a reset link to your phone; in this demo it is a placeholder." },
  { q: "Where is my data stored?", a: "Your session and wallet are stored on this device only. Bank lookup and SMS features use the APIs configured in Settings." },
];



function toggleFaq(item) {
  const list = item.closest(".faq-list") || item.parentElement.parentElement;
  if (!list) return;
  list.querySelectorAll(".faq-item").forEach((x) => x.classList.remove("open"));
  if (!item.classList.contains("open")) item.classList.add("open");
}

