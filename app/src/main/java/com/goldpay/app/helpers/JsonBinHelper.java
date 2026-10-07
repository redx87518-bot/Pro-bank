package com.goldpay.app.helpers;

import android.util.Log;

import com.goldpay.app.BuildConfig;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * GET / PUT access to the shared JSON Bin.
 * Reads use the X-Access-Key when available, falling back to the X-Master-Key.
 * Writes always use the X-Master-Key.
 * All secrets stay native — JS never sees a key.
 */
public final class JsonBinHelper {

    private static final String TAG = "JsonBinHelper";
    private static final String BASE = "https://api.jsonbin.io/v3/b/";

    private JsonBinHelper() {}

    /** GET {bin}/latest. Returns the raw record (the bin's data object). */
    public static String get() {
        try {
            URL url = new URL(BASE + BuildConfig.JSONBIN_BIN_ID + "/latest");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("GET");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            String access = SharedPrefsHelper.getJsonBinAccessKey();
            if (!isEmpty(access)) {
                c.setRequestProperty("X-Access-Key", access);
            } else {
                c.setRequestProperty("X-Master-Key", BuildConfig.JSONBIN_MASTER_KEY);
            }
            c.setRequestProperty("X-Bin-Meta", "false");
            return read(c);
        } catch (Exception e) {
            Log.e(TAG, "get failed", e);
            return null;
        }
    }

    /** PUT {bin} — replaces the record. Versioning is disabled with X-Bin-Versioning: false. */
    public static String put(String body) {
        try {
            URL url = new URL(BASE + BuildConfig.JSONBIN_BIN_ID);
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("PUT");
            c.setConnectTimeout(15000);
            c.setReadTimeout(25000);
            c.setDoOutput(true);
            c.setRequestProperty("X-Master-Key", BuildConfig.JSONBIN_MASTER_KEY);
            c.setRequestProperty("X-Bin-Versioning", "false");
            c.setRequestProperty("Content-Type", "application/json");
            OutputStreamWriter w = new OutputStreamWriter(c.getOutputStream(), "UTF-8");
            w.write(body);
            w.flush();
            w.close();
            return read(c);
        } catch (Exception e) {
            Log.e(TAG, "put failed", e);
            return null;
        }
    }

    /** True when the record already contains a wallets section ( GoldPay schema v2). */
    public static boolean hasWallets(String record) {
        try {
            JSONObject o = new JSONObject(record);
            return o.has("wallets") && o.getJSONObject("wallets").length() >= 0;
        } catch (Exception e) {
            return false;
        }
    }

    private static String read(HttpURLConnection c) {
        try {
            int code = c.getResponseCode();
            BufferedReader r = new BufferedReader(new InputStreamReader(
                    code >= 400 ? c.getErrorStream() : c.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            if (code >= 400) {
                Log.e(TAG, "HTTP " + code + " → " + sb);
                return null;
            }
            return sb.toString();
        } catch (Exception e) {
            Log.e(TAG, "read failed", e);
            return null;
        } finally {
            c.disconnect();
        }
    }

    private static boolean isEmpty(String s) { return s == null || s.trim().isEmpty(); }
}
