import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// local.properties carries the user-provided secrets (gitignored) — injected into BuildConfig.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun cfg(name: String): String = (localProps.getProperty(name) ?: "").replace("\"", "")

android {
    namespace = "com.goldpay.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.goldpay.app"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        buildConfigField("String", "TERMII_BASE_URL", "\"${cfg("TERMII_BASE_URL")}\"")
        buildConfigField("String", "TERMII_API_KEY", "\"${cfg("TERMII_API_KEY")}\"")
        buildConfigField("String", "TERMII_SENDER_ID", "\"${cfg("TERMII_SENDER_ID")}\"")
        buildConfigField("String", "PAYSTACK_DEFAULT_SECRET", "\"${cfg("PAYSTACK_DEFAULT_SECRET")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Demo app: sign release with the debug key so the CI APK installs directly.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.13.1")
}
