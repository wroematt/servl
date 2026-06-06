package com.servl.app.data.repository

import com.google.firebase.messaging.FirebaseMessaging
import com.servl.app.data.local.TokenDataStore
import com.servl.app.data.network.ApiService
import com.servl.app.data.network.dto.*
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val tokenDataStore: TokenDataStore,
) {
    suspend fun login(email: String, password: String): UserDto {
        val response = api.login(LoginRequest(email, password))
        tokenDataStore.accessToken = response.accessToken
        tokenDataStore.saveRefreshToken(response.refreshToken)
        uploadFcmToken()
        return response.user ?: api.getMe()
    }

    suspend fun loginWithGoogle(idToken: String): UserDto {
        val response = api.googleSignIn(GoogleSignInRequest(idToken))
        tokenDataStore.accessToken = response.accessToken
        tokenDataStore.saveRefreshToken(response.refreshToken)
        uploadFcmToken()
        return response.user ?: api.getMe()
    }

    suspend fun register(name: String, email: String, password: String): UserDto {
        val response = api.register(RegisterRequest(name, email, password))
        tokenDataStore.accessToken = response.accessToken
        tokenDataStore.saveRefreshToken(response.refreshToken)
        uploadFcmToken()
        return response.user ?: api.getMe()
    }

    suspend fun refreshSession(): UserDto? {
        val refreshToken = tokenDataStore.getRefreshToken() ?: return null
        return try {
            val response = api.refresh(RefreshRequest(refreshToken))
            tokenDataStore.accessToken = response.accessToken
            response.refreshToken?.let { tokenDataStore.saveRefreshToken(it) }
            // Upload FCM token on every session restore so the server always has
            // an up-to-date token even if the app was never explicitly logged out.
            uploadFcmToken()
            api.getMe()
        } catch (e: Exception) {
            tokenDataStore.clearTokens()
            null
        }
    }

    suspend fun logout() {
        try { api.logout() } catch (_: Exception) { /* best-effort */ }
        tokenDataStore.clearTokens()
    }

    suspend fun forgotPassword(email: String) =
        api.forgotPassword(ForgotPasswordRequest(email))

    suspend fun resetPassword(token: String, password: String) =
        api.resetPassword(ResetPasswordRequest(token, password))

    /**
     * Fetches the current FCM registration token from Firebase and uploads it to the
     * backend via PATCH /users/me so the server can target this device for push notifications.
     *
     * Called after every successful sign-in. Firebase caches the token locally, so this is
     * fast (no network round-trip to Firebase) unless the token has been invalidated.
     * Failures are swallowed — a missing token just means the user won't receive push
     * notifications on this session; it's not a reason to fail login.
     */
    private suspend fun uploadFcmToken() {
        try {
            val token = suspendCancellableCoroutine<String?> { cont ->
                FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { cont.resume(it) }
                    .addOnFailureListener { cont.resume(null) }
            } ?: return
            api.updateMe(UpdateUserRequest(fcm_token = token))
        } catch (_: Exception) { /* best-effort */ }
    }
}
