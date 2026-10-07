package com.goldpay.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import com.goldpay.app.helpers.ApiHelper;
import com.goldpay.app.helpers.SharedPrefsHelper;
import com.goldpay.app.helpers.TermiiHelper;
import org.json.JSONObject;

/**
 * JavaScript bridge. All HTTP stays native so no key ever reaches JS.
 * Methods are invoked from script.js via GoldPayNative.<method>(...).
 *
 * In this OPay-style local-auth build the wallet backend is now on-device.
 * No JSON Bin integration remains in this build.
 */
public class WebAppInterface {

    private final Activity activity;

    public WebAppInterface(Activity activity) {
        this.activity = activity;
    }

    // ---------- Storage (local session only) ----------

    @JavascriptInterface
    public String binGet() { return "{}"; }

    @JavascriptInterface
    public boolean binPut(final String body) {
        return false;
    }

    @JavascriptInterface
    public String binProbe() { return "none"; }

    // ---------- Credit-alert SMS (Termii, credit alerts only) ----------

    /**
     * Sends the exact credit-alert template to the recipient's phone,
     * derived from their account number (019xxxxxxxxxx → +234xxxxxxxxxx).
     */
    @JavascriptInterface
    public void sendCreditSms(String toPhoneE164,
                              String amount,
                              String senderName,
                              String senderAccount,
                              String date,
                              String time,
                              String type,
                              String balance,
                              String txId) {
        TermiiHelper.sendCreditAlert(toPhoneE164, amount, senderName, senderAccount,
                date, time, type, balance, txId);
    }

    /** 0198123456789 → +2348123456789 (strip the 019 prefix, prepend +234). */
    @JavascriptInterface
    public String accountToE164(String accountNumber) {
        if (accountNumber == null) return "";
        String digits = accountNumber.replaceAll("[^0-9]", "");
        if (digits.length() == 13 && digits.startsWith("019")) {
            return "+234" + digits.substring(3);
        }
        if (digits.length() == 10) {
            return "+234" + digits;
        }
        return "";
    }

    // ---------- Paystack (bank list + account name) ----------

    /** Returns a JSON array of {code,name} banks or "[]" on failure. */
    @JavascriptInterface
    public String getBanks() {
        final String[] out = {ApiHelper.fallbackBanksJson()};
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                String resp = ApiHelper.paystackBanks(SharedPrefsHelper.effectivePaystackKey());
                if (resp != null) {
                    String flat = ApiHelper.extractBanks(resp);
                    if (flat != null && flat.length() > 2) out[0] = flat;
                }
            }
        });
        t.start();
        try {
            t.join(15000);
        } catch (InterruptedException ignored) {
        }
        return out[0];
    }

    /** Returns the resolved account name, or "unknown" if lookup fails. */
    @JavascriptInterface
    public String resolveAccountName(final String accountNumber, final String bankCode) {
        final String[] out = {"unknown"};
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                String resp = ApiHelper.paystackResolve(SharedPrefsHelper.effectivePaystackKey(),
                        accountNumber, bankCode);
                if (resp != null) {
                    String name = ApiHelper.extractAccountName(resp);
                    if (name != null && !name.trim().isEmpty()) out[0] = name;
                }
            }
        });
        t.start();
        try {
            t.join(15000);
        } catch (InterruptedException ignored) {
        }
        return out[0];
    }

    /** "user" when a user-entered key is saved, "default" for the BuildConfig fallback, "" for none. */
    @JavascriptInterface
    public String paystackKeySource() {
        String user = SharedPrefsHelper.getPaystackKey();
        if (user != null && !user.trim().isEmpty()) return "user";
        String def = BuildConfig.PAYSTACK_DEFAULT_SECRET;
        return def != null && !def.trim().isEmpty() ? "default" : "";
    }

    // ---------- Preferences ----------

    @JavascriptInterface
    public void setPaystackKey(String key) {
        SharedPrefsHelper.setPaystackKey(key == null ? "" : key.trim());
    }

    @JavascriptInterface
    public String getPaystackKey() {
        // JS sees only a masked hint, never the real key.
        String k = SharedPrefsHelper.getPaystackKey();
        if (k == null || k.length() < 8) return "";
        return "sk_****" + k.substring(k.length() - 4);
    }

    @JavascriptInterface
    public void clearPaystackKey() {
        SharedPrefsHelper.setPaystackKey("");
    }

    @JavascriptInterface
    public void setTheme(String theme) {
        SharedPrefsHelper.setTheme(theme);
    }

    @JavascriptInterface
    public String getTheme() {
        return SharedPrefsHelper.getTheme();
    }

    @JavascriptInterface
    public void setBiometric(boolean on) {
        SharedPrefsHelper.setBiometric(on);
    }

    @JavascriptInterface
    public boolean getBiometric() {
        return SharedPrefsHelper.getBiometric();
    }

    @JavascriptInterface
    public void setBeneficiaries(String json) {
        SharedPrefsHelper.setBeneficiaries(json);
    }

    @JavascriptInterface
    public String getBeneficiaries() {
        return SharedPrefsHelper.getBeneficiaries();
    }

    @JavascriptInterface
    public void setContacts(String json) {
        SharedPrefsHelper.setContacts(json);
    }

    @JavascriptInterface
    public String getContacts() {
        return SharedPrefsHelper.getContacts();
    }

    @JavascriptInterface
    public void setSession(String phone) {
        SharedPrefsHelper.setLoggedInPhone(phone);
    }

    @JavascriptInterface
    public String getSession() {
        return SharedPrefsHelper.getLoggedInPhone();
    }

    @JavascriptInterface
    public void clearSession() {
        SharedPrefsHelper.setLoggedInPhone(null);
    }

    // ---------- Sender ID / version (read-only, from BuildConfig) ----------

    @JavascriptInterface
    public String getSenderId() {
        return BuildConfig.TERMII_SENDER_ID;
    }

    @JavascriptInterface
    public String getAppVersion() {
        return BuildConfig.VERSION_NAME;
    }

    // ---------- Camera / gallery for avatar ----------

    @JavascriptInterface
    public void pickAvatar() {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.setType("image/*");
                i.addCategory(Intent.CATEGORY_OPENABLE);
                activity.startActivityForResult(Intent.createChooser(i, "Select avatar"), 4242);
            }
        });
    }

    // ---------- Misc ----------

    @JavascriptInterface
    public void toast(String msg) {
        final String m = msg;
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                android.widget.Toast.makeText(activity, m, android.widget.Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void haptic() {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Activity.VIBRATOR_SERVICE);
            if (v == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                v.vibrate(20);
            }
        } catch (Exception ignored) {
        }
    }

    /** Reads a picked image as a base64 data URL so JS can show it as the avatar. */
    @JavascriptInterface
    public String consumePickedAvatar() {
        byte[] bytes = MainActivity.consumeLastPickedBytes();
        if (bytes == null) return "";
        return "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
    }
}
