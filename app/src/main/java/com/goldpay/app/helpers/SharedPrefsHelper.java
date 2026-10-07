package com.goldpay.app.helpers;

import android.content.Context;
import android.content.SharedPreferences;

import com.goldpay.app.App;
import com.goldpay.app.BuildConfig;

/**
 * SharedPreferences persistence for all local app state:
 * session user, theme, biometric toggle, Paystack key, beneficiaries, contacts.
 */
public final class SharedPrefsHelper {

    private static final String FILE = "goldpay_prefs";
    private static final String K_LOGGED_IN = "logged_in_phone";
    private static final String K_PAYSTACK_KEY = "paystack_secret_key";
    private static final String K_THEME = "theme";
    private static final String K_BIO = "biometric_enabled";
    private static final String K_BENEFICIARIES = "beneficiaries";
    private static final String K_CONTACTS = "contacts";
    private static final String K_ACCESS_KEY = "jsonbin_access_key";

    private SharedPrefsHelper() {}

    private static SharedPreferences prefs() {
        return App.context().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public static void setLoggedInPhone(String phone) {
        prefs().edit().putString(K_LOGGED_IN, phone).apply();
    }

    public static String getLoggedInPhone() {
        return prefs().getString(K_LOGGED_IN, null);
    }

    // ---- Paystack ----

    public static void setPaystackKey(String key) { prefs().edit().putString(K_PAYSTACK_KEY, key).apply(); }

    public static String getPaystackKey() { return prefs().getString(K_PAYSTACK_KEY, ""); }

    /** User key wins; falls back to the BuildConfig default (may be empty). */
    public static String effectivePaystackKey() {
        String user = getPaystackKey();
        return !isEmpty(user) ? user : BuildConfig.PAYSTACK_DEFAULT_SECRET;
    }

    // ---- Theme ----

    public static void setTheme(String theme) { prefs().edit().putString(K_THEME, theme).apply(); }

    public static String getTheme() { return prefs().getString(K_THEME, "light"); }

    // ---- Biometrics ----

    public static void setBiometric(boolean on) { prefs().edit().putBoolean(K_BIO, on).apply(); }

    public static boolean getBiometric() { return prefs().getBoolean(K_BIO, false); }

    // ---- Beneficiaries ----

    public static void setBeneficiaries(String json) { prefs().edit().putString(K_BENEFICIARIES, json).apply(); }

    public static String getBeneficiaries() { return prefs().getString(K_BENEFICIARIES, "[]"); }

    // ---- Contacts (phone → name + avatar) ----

    public static void setContacts(String json) { prefs().edit().putString(K_CONTACTS, json).apply(); }

    public static String getContacts() { return prefs().getString(K_CONTACTS, "{}"); }

    // ---- JSON Bin access key ----

    public static void setJsonBinAccessKey(String key) { prefs().edit().putString(K_ACCESS_KEY, key).apply(); }

    public static String getJsonBinAccessKey() { return prefs().getString(K_ACCESS_KEY, ""); }

    private static boolean isEmpty(String s) { return s == null || s.trim().isEmpty(); }
}
