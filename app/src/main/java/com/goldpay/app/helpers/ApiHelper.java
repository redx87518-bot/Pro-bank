package com.goldpay.app.helpers;

import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Paystack bank list + account-name resolution.
 * Uses the user's own key saved in Settings, falling back to the BuildConfig default.
 * Empty key in both → graceful fallbacks in the bridge (built-in bank list / name "unknown").
 */
public final class ApiHelper {

    private static final String TAG = "ApiHelper";

    private ApiHelper() {}

    /** GET /bank — Nigerian bank list. Returns raw body or null. */
    public static String paystackBanks(String secret) {
        if (isEmpty(secret)) return null;
        try {
            URL url = new URL("https://api.paystack.co/bank?currency=NGN");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("GET");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Authorization", "Bearer " + secret);
            return read(c);
        } catch (Exception e) {
            Log.e(TAG, "banks failed", e);
            return null;
        }
    }

    /** GET /bank/resolve?account_number=&bank_code= — returns raw body or null. */
    public static String paystackResolve(String secret, String accountNumber, String bankCode) {
        if (isEmpty(secret)) return null;
        try {
            String u = "https://api.paystack.co/bank/resolve?account_number="
                    + URLEncoder.encode(accountNumber, "UTF-8")
                    + "&bank_code=" + URLEncoder.encode(bankCode, "UTF-8");
            URL url = new URL(u);
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("GET");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Authorization", "Bearer " + secret);
            return read(c);
        } catch (Exception e) {
            Log.e(TAG, "resolve failed", e);
            return null;
        }
    }

    public static String extractAccountName(String responseBody) {
        try {
            JSONObject o = new JSONObject(responseBody);
            boolean status = o.optBoolean("status", false);
            if (status) {
                JSONObject data = o.optJSONObject("data");
                if (data != null) {
                    return data.optString("account_name", "");
                }
            }
            return "";
        } catch (Exception e) {
            return "";
        }
    }

    /** Flattens a Paystack /bank response into a [{code,name}] JSON array (institutions only). */
    public static String extractBanks(String responseBody) {
        try {
            JSONObject o = new JSONObject(responseBody);
            JSONArray data = o.optJSONArray("data");
            JSONArray out = new JSONArray();
            if (data != null) {
                for (int i = 0; i < data.length(); i++) {
                    JSONObject b = data.optJSONObject(i);
                    if (b == null) continue;
                    String code = b.optString("code", "");
                    String name = b.optString("name", "");
                    boolean active = b.optBoolean("active", true);
                    boolean isMobile = b.optBoolean("is_mobile_money", false);
                    if (!active || isMobile) continue;
                    if (code.isEmpty() || name.isEmpty()) continue;
                    JSONObject j = new JSONObject();
                    j.put("code", code);
                    j.put("name", name);
                    out.put(j);
                }
            }
            return out.toString();
        } catch (Exception e) {
            return null;
        }
    }

    /** Compact built-in fallback bank list used when no Paystack key is available. */
    public static String fallbackBanksJson() {
        try {
            JSONArray out = new JSONArray();
            String[][] banks = {
                    {"044", "Access Bank"}, {"050", "Ecobank"}, {"070", "Fidelity Bank"},
                    {"011", "First Bank"}, {"214", "First City Monument Bank"}, {"058", "GTBank"},
                    {"030", "Heritage Bank"}, {"301", "Jaiz Bank"}, {"082", "Keystone Bank"},
                    {"526", "Kuda MFB"}, {"999992", "Moniepoint MFB"}, {"566", "SunTrust Bank"},
                    {"232", "Sterling Bank"}, {"100", "SunTrust Bank"}, {"030110", "TAJ Bank"},
                    {"032", "Union Bank"}, {"033", "United Bank for Africa"}, {"03", "Unity Bank"},
                    {"035", "Wema Bank"}, {"057", "Zenith Bank"}, {"305", "PalmPay MFB"},
                    {"999991", "OPay Digital Services"}
            };
            for (String[] b : banks) {
                JSONObject j = new JSONObject();
                j.put("code", b[0]);
                j.put("name", b[1]);
                out.put(j);
            }
            return out.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    private static String read(HttpURLConnection c) {
        try {
            int code = c.getResponseCode();
            BufferedReader r = new BufferedReader(new InputStreamReader(
                    code >= 400 ? c.getErrorStream() : c.getInputStream(), StandardCharsets.UTF_8));
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
