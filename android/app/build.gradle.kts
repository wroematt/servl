// Move build output outside Documents so Windows Search Indexer cannot lock intermediate files
layout.buildDirectory.set(file("C:/ServlBuild/app"))

plugins {
    alias(libs.plugins.android.application)
    // kotlin-android is applied separately because android.builtInKotlin=false
    // keeps Android BaseExtension available (required by the Hilt Gradle plugin)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.google.services)
}

android {
    namespace = "com.servl.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.servl.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 21
        versionName = "2.0.1"

        // Debug: points to the same cloud server as release.
        // To test against a local server instead, change these to your PC's LAN IP.
        buildConfigField("String", "BASE_URL", "\"https://api.servl.uk\"")
        buildConfigField("String", "MQTT_BROKER_HOST", "\"mqtt.servl.uk\"")
        // Firebase Console → Authentication → Sign-in method → Google → Web SDK config → Web client ID
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"42503743783-4obce0mmlld9uog8unk8f8enh8f290ho.apps.googleusercontent.com\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Override BASE_URL and MQTT_BROKER_HOST for production builds
            buildConfigField("String", "BASE_URL", "\"https://api.servl.uk\"")
            buildConfigField("String", "MQTT_BROKER_HOST", "\"mqtt.servl.uk\"")
            buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"42503743783-4obce0mmlld9uog8unk8f8enh8f290ho.apps.googleusercontent.com\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        // Known bug in androidx.lifecycle lint detector conflicting with Kotlin 2.x.
        // See: https://issuetracker.google.com/issues/247542825
        disable += "NullSafeMutableLiveData"
    }
}

// Kotlin compiler options — replaces deprecated kotlinOptions inside android {}
// android.builtInKotlin=false means compilerOptions is not available on the
// android extension; the standalone kotlin-android plugin exposes it here instead.
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    // Compose BOM
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    debugImplementation(libs.compose.ui.tooling)

    // Navigation
    implementation(libs.navigation.compose)

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    // Networking
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.gson)

    // Token storage
    implementation(libs.datastore.preferences)

    // Image loading
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.coil.svg)

    // Charts
    implementation(libs.vico.compose)
    implementation(libs.vico.compose.m3)

    // Lifecycle + ViewModel
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)

    // Firebase
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)

    // Activity + Splash
    implementation(libs.activity.compose)
    implementation(libs.core.splashscreen)

    // Google Sign-In (Credential Manager)
    implementation(libs.credentials)
    implementation(libs.credentials.play.services.auth)
    implementation(libs.google.identity)
}
