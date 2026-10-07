package com.goldpay.app;

import android.app.Application;

public class App extends Application {
    private static volatile App instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    /** Static context access so bridge helpers can resolve SharedPreferences without extra wiring. */
    public static App context() { return instance; }
}
