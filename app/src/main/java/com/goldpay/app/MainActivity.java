package com.goldpay.app;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;

import com.goldpay.app.helpers.SharedPrefsHelper;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static byte[] lastPickedBytes;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        applyStatusBar();

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        WebView.setWebContentsDebuggingEnabled(true);
        webView.addJavascriptInterface(new WebAppInterface(this), "GoldPayNative");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient());

        webView.loadUrl("file:///android_asset/index.html");
    }

    private void applyStatusBar() {
        Window w = getWindow();
        if ("dark".equals(SharedPrefsHelper.getTheme())) {
            w.setStatusBarColor(Color.parseColor("#101418"));
            w.setNavigationBarColor(Color.parseColor("#101418"));
            w.getDecorView().setSystemUiVisibility(0);
        } else {
            w.setStatusBarColor(Color.parseColor("#D4AF37"));
            w.setNavigationBarColor(Color.parseColor("#F7F3EA"));
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 4242 && resultCode == RESULT_OK && data != null && data.getData() != null) {
            try {
                InputStream is = getContentResolver().openInputStream(data.getData());
                Bitmap bmp = BitmapFactory.decodeStream(is);
                if (bmp != null) {
                    int side = Math.min(bmp.getWidth(), bmp.getHeight());
                    int x = (bmp.getWidth() - side) / 2;
                    int y = (bmp.getHeight() - side) / 2;
                    Bitmap sq = Bitmap.createBitmap(bmp, x, y, side, side);
                    Bitmap scaled = Bitmap.createScaledBitmap(sq, 256, 256, true);
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    scaled.compress(Bitmap.CompressFormat.JPEG, 85, bos);
                    lastPickedBytes = bos.toByteArray();
                    webView.evaluateJavascript("window.onAvatarPicked && window.onAvatarPicked()", null);
                    return;
                }
            } catch (Exception ignored) {
            }
        }
        lastPickedBytes = null;
    }

    /** Called by WebAppInterface so JS can consume the picked avatar as a base64 data URL. */
    public static byte[] consumeLastPickedBytes() {
        byte[] b = lastPickedBytes;
        lastPickedBytes = null;
        return b;
    }
}
