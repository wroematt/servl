# Retrofit / OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }

# Gson — keep data classes used for JSON serialisation
-keep class com.servl.app.data.network.dto.** { *; }
-keepclassmembers class com.servl.app.data.network.dto.** { *; }

# Hilt
-keep class dagger.** { *; }
-keep class javax.inject.** { *; }

# Vico charts
-keep class com.patrykandpatrick.vico.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }
