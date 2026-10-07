package com.goldpay.app.helpers;

/**
 * Stubbed JSON Bin compat layer for this OPay-style local-auth build.
 * Real wallet data now lives on-device; the only consumers are the
 * browser-dev mock paths in script.js, so these methods are no-ops.
 */
public final class NativeJsonStub {

    private NativeJsonStub() {}

    /** Returns a valid JSON string so script.js does not crash in the browser-dev mock branch. */
    public static String get() {
        try {
            return "{\"version\":\"2.1\"}";
        } catch (Exception e) {
            return "{\"version\":\"2.1\"}";
        }
    }

    /** No-op PUT; returns a JSON string so script.js sees "success" shape in mock branch. */
    public static String put(String body) {
        try {
            return "{\"success\":true}";
        } catch (Exception e) {
            return "{\"success\":false}";
        }
    }
}
