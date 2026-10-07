package com.goldpay.app.helpers;

import android.os.Build;
import android.util.Log;

import com.goldpay.app.BuildConfig;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Credit-alert-only SMS via Termii.
 * Sent after every successful credit (app-to-app or simulated bank credit).
 * No OTP, no debit SMS — per GoldPay demo spec.
 */
public final class TermiiHelper {

    private static final String TAG = "TermiiHelper";

    private TermiiHelper() {}

    /** Build the exact template required by the spec and send it. */
    public static void sendCreditAlert(final String toPhoneE164,
                                       final String amount,
                                       final String senderName,
                                       final String senderAccount,
                                       final String date,
                                       final String time,
                                       final String type,
                                       final String balance,
                                       final String txId) {
        final String body =
                "Credit Alert\n\n"
                + "Amount: ₦" + amount + "\n"
                + "From: " + senderName + " (" + senderAccount + ")\n"
                + "Date: " + date + "\n"
                + "Time: " + time + "\n"
                + "Transaction Type: " + type + "\n"
                + "Available Balance: ₦" + balance + "\n"
                + "Transaction ID: " + txId + "\n\n"
                + "Thank you for using GoldPay.";

        new Thread(new Runnable() {
            @Override
            public void run() {
                send(toPhoneE164, body);
            }
        }).start();
    }

    private static void send(String toE164, String message) {
        try {
            URL url = new URL(trimSlash(BuildConfig.TERMII_BASE_URL) + "/api/sms/send");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");

            JSONObject payload = new JSONObject();
            payload.put("to", toE164);
            payload.put("from", BuildConfig.TERMII_SENDER_ID);
            payload.put("sms", message);
            payload.put("api_key", BuildConfig.TERMII_API_KEY);
            payload.put("channel", "generic");

            OutputStreamWriter w = new OutputStreamWriter(c.getOutputStream(), "UTF-8");
            w.write(payload.toString());
            w.flush();
            w.close();

            int code = c.getResponseCode();
            BufferedReader r = new BufferedReader(new InputStreamReader(
                    code >= 400 ? c.getErrorStream() : c.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
            r.close();
            Log.i(TAG, "Termii HTTP " + code + " → " + sb);
        } catch (Exception e) {
            Log.e(TAG, "send failed", e);
        }
    }

    private static String trimSlash(String s) {
        return s != null && s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
