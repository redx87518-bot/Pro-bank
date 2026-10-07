# GoldPay keeps minification disabled for this demo; no shrink rules needed.
# If enabling R8 later, keep the WebView bridge:
-keepclassmembers class com.goldpay.app.WebAppInterface {
    @android.webkit.JavascriptInterface <methods>;
}
