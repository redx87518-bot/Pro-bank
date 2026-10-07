# GoldPay (Demo)

A one-to-one Opay-style mobile banking UI built as a **demo/educational app**: Android WebView shell (Kotlin) + HTML/CSS/JS screens, gold (`#D4AF37`) accents, simulated money movement, credit-alert-only SMS.

> **Legal disclaimer** — This is a demo app for educational purposes. All balances and transactions are simulated. Not affiliated with any bank or payment provider (including Opay, Paystack, Termii, JSON Bin).

## What works

- Register (name + 10-digit phone + 4-digit PIN) → account `019<phone>` + ₦5,000,000 demo bonus
- Log in with account number / phone + PIN
- Dashboard: greeting, avatar, hide/show balance, 6 quick actions, recent transactions
- Send Money: Mobile Wallet (019… / phone / `GP_…`), Mobile Bank (Paystack bank list + `/bank/resolve` name lookup), Beneficiaries
- Airtime, Data plans, Electricity (mock customer fetch), Cable TV (bouquets), Internet/Education
- Mock cards, transaction history, notifications, mock devices, change PIN, biometric toggle (mock), profile + avatar upload
- Settings: instant dark/light toggle, **user-editable Paystack key** (saved on device, with default-key warning and clear button), Termii sender ID display, app version, logout
- **Credit-alert SMS via Termii** — sent only when a wallet receives funds (app-to-app + registration bonus), exact template from the spec, number derived `019xxxxxxxxxx → +234xxxxxxxxxx`
- Receipt modal styled after Opay's receipt (centered gold header, dashed divider, field rows, status footer)

## Architecture

```
MainActivity (WebView + bridge)  ←→  index.html / style.css / script.js
WebAppInterface  (JS ⇄ Kotlin bridge, no keys in JS)
├── JsonBinHelper      GET/PUT api.jsonbin.io/v3/b/<bin>  (X-Access-Key read, X-Master-Key write)
├── TermiiHelper       POST /api/sms/send (credit alerts only)
├── ApiHelper          Paystack /bank + /bank/resolve (user key → BuildConfig fallback)
└── SharedPrefsHelper  session, theme, biometrics, Paystack key, beneficiaries, contacts
```

Secrets live in `local.properties` (gitignored) and are baked into `BuildConfig` at compile time. The Paystack secret can be **changed in-app** (Settings → Paystack API key); it is stored in SharedPreferences and used for all bank lookups, falling back to the compiled default when empty.

### JSON Bin schema (v2.1)

Your existing bin keeps `users[]` (legacy data, untouched) and gains a `wallets{}` object keyed by account number — GoldPay reads/writes only `wallets{}`.

## Setup

1. Open the project in Android Studio (JDK 17).
2. Fill `local.properties` with your keys:
   ```properties
   TERMII_BASE_URL=https://v4.api.termii.com
   TERMII_API_KEY=...
   TERMII_SENDER_ID=...
   JSONBIN_MASTER_KEY=...
   JSONBIN_BIN_ID=...
   PAYSTACK_DEFAULT_SECRET=
   ```
3. Run `./gradlew assembleDebug` (or press ▶ in Android Studio).
4. For CI builds, add the same keys as GitHub repo secrets (`TERMII_BASE_URL`, `TERMII_API_KEY`, `TERMII_SENDER_ID`, `JSONBIN_MASTER_KEY`, `JSONBIN_BIN_ID`, `PAYSTACK_DEFAULT_SECRET`) — `.github/workflows/build.yml` writes them to `local.properties` and builds with retry, then uploads `GoldPay-APK`.
5. In-app Paystack key: Settings → Paystack API key → paste `sk_test_…`/`sk_live_…` → Save. Bank lookups switch to your key immediately; Clear reverts to the default.

### SMS cost note

Termii sends **only credit alerts**. At ~₦4–6 per SMS, budget accordingly when testing wallet-to-wallet transfers. Sender ID falls back to "Termii" unless your Sender ID is registered on the account.

## Packaging

Run `sh ./scripts/package_zip.sh` to produce `GoldPay.zip` (full project, no build outputs or secrets).
