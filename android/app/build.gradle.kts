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
        versionCode = 1
        versionName = "1.0.0"

        // Debug: replace with your PC's local IP when testing on a physical device
        // e.g. "http://192.168.50.41:3000"  (run `ipconfig` on your PC to find it)
        buildConfigField("String", "BASE_URL", "\"http://192.168.50.41:3000\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Override BASE_URL for production builds
            buildConfigField("String", "BASE_URL", "\"http://10.0.2.2:3000\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
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
}
