# OPay (Demo)

A one-to-one **OPay-style** mobile banking UI built as a **demo/educational app**: Android WebView shell (Kotlin) + HTML/CSS/JS screens, OPay green (`#1DA542`) accents, simulated money movement, credit-alert-only SMS.

> **Legal disclaimer** — This is a demo app for educational purposes. All balances and transactions are simulated. Not affiliated with OPay or any payment provider.

## What works now (local-auth build)

- Splash with OPay logo mark and disclaimer
- Sign-in screen: **guest mode** (demo balances, no PIN) and **account sign-in** (account/phone + 4-digit PIN); saved session restores directly into the app on launch
- Register a new OPay account (name + 10-digit phone + 4-digit PIN) → account `019<phone>` and ₦5,000,000 demo bonus
- OPay-styled app shell: green header, avatar greeting, balance card with hide/show, bottom nav with labels
- Home: transfer & pay tile grid (Send, Airtime, Data, Bills, Add money, Savings), recent transactions
- Send: segmented Wallet / Bank / Favorites tabs; wallet verify-by-account/phone/GP address, bank verify via Paystack bank list + account name lookup, favorites
- Airtime, Data (plans), Bills (water / cable TV / internet), Add money (deposit to another account or simulate bank transfer to another account)
- Savings (demo investment/savings top-ups), saved cards (mock), full transaction history, notifications, security (change PIN, biometric toggle mock), profile + avatar pick, settings (dark mode, Paystack API key on device, sender ID, app version, logout)
- **Credit-alert SMS via Termii** — sent only when a wallet receives funds (app-to-app, registration bonus, add-money deposit), exact template, recipient derived `019xxxxxxxxxx → +234xxxxxxxxxx`
- OPay-style receipt modal after successful actions

## Architecture

```
MainActivity (WebView + bridge)  ←→  index.html / style.css / script.js
WebAppInterface  (JS ⇄ Kotlin bridge, no keys in JS)
├── TermiiHelper        POST /api/sms/send (credit alerts only)
├── ApiHelper           Paystack /bank + /bank/resolve (user key → BuildConfig fallback)
├── NativeJsonStub      binGet/binPut no-op stubs (kept only for browser-dev mock compat)
└── SharedPrefsHelper   session, theme, biometrics, Paystack key, beneficiaries
```

In this build the wallet is **on-device** (per-account `SharedPreferences` via `localStorage`-equivalent paths in JS and native session in the app). JSON Bin is no longer used, so no JSON Bin keys are required.

Secrets live in `local.properties` (gitignored) and are baked into `BuildConfig` at compile time. The Paystack secret can be **changed in-app** (Settings → Paystack API key); it is stored on the device and used for bank lookups, falling back to the compiled default when empty.

### SMS cost note

Termii sends **only credit alerts**. At ~₦4–6 per SMS, budget accordingly when testing wallet-to-wallet transfers or deposits. Sender ID falls back to "Termii" unless your Sender ID is registered on the account.

## Setup

1. Open the project in Android Studio (JDK 17).
2. Fill `local.properties` with your keys:
   ```properties
   TERMII_BASE_URL=https://v4.api.termii.com
   TERMII_API_KEY=...
   TERMII_SENDER_ID=...
   PAYSTACK_DEFAULT_SECRET=
   ```
   JSON Bin keys are **not required** for this build.
3. Run `./gradlew assembleDebug` (or press ▶ in Android Studio).
4. For CI builds, add `TERMII_BASE_URL`, `TERMII_API_KEY`, `TERMII_SENDER_ID`, and `PAYSTACK_DEFAULT_SECRET` as GitHub repo secrets — `.github/workflows/build.yml` writes them to `local.properties` and builds with retry, then uploads `OPay-APK`.
5. In-app Paystack key: Settings → Paystack API key → paste `sk_test_…`/`sk_live_…` → Save. Bank lookups switch to your key immediately; Clear reverts to the default.

## Recommended demo flow

1. Open the app → create an account (name + phone + PIN) → receive ₦5,000,000.
2. Register a second account on another device/emulator and send money between the two.
3. Verify the recipient before sending; confirm with PIN.
4. Watch the sender's history, recipient's credit funds, and the credit-alert SMS (if Termii is set up).

## Packaging

Run `sh ./scripts/package_zip.sh` to produce `OPay.zip` (full project, no build outputs or secrets).
