package com.goldpay.app.helpers;

import android.util.Log;

import org.json.JSONObject;

/***
 * Compile-compatible JSON Bin helper for the OPay-style local-auth build.
 *
 * Real wallet data now lives on-device, so this class no longer performs real
 * JSON Bin HTTP calls and no longer references JSONBIN_MASTER_KEY / JSONBIN_BIN_ID.
 * get/put return valid JSON so script.js and any legacy call sites keep behaving.
 */
public final class JsonBinHelper {

    private static final String TAG = "JsonBinHelper";

    private JsonBinHelper() {}

    /** GET {bin}/latest — stub returns a valid JSON record. */
    public static String get() {
        try {
            return "{\"version\":\"2.1\"}";
        } catch (Exception e) {
            Log.e(TAG, "get failed", e);
            return null;
        }
    }

    /** PUT {bin} — stub returns a success shape. */
    public static String put(String body) {
        try {
            return "{\"success\":true}";
        } catch (Exception e) {
            Log.e(TAG, "put failed", e);
            return null;
        }
    }

    /** True when the record already contains a wallets section (schema v2 compat). */
    public static boolean hasWallets(String record) {
        try {
            JSONObject o = new JSONObject(record);
            return o.has("wallets") && o.getJSONObject("wallets").length() >= 0;
        } catch (Exception e) {
            return false;
        }
    }
}
