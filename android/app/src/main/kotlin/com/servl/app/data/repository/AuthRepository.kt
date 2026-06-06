package com.servl.app.data.repository

import com.servl.app.data.local.TokenDataStore
import com.servl.app.data.network.ApiService
import com.servl.app.data.network.dto.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: ApiService,
    private val tokenDataStore: TokenDataStore,
) {
    suspend fun login(email: String, password: String): UserDto {
        val response = api.login(LoginRequest(email, password))
        tokenDataStore.accessToken = response.accessToken
        tokenDataStore.saveRefreshToken(response.refreshToken)
        // Token is now stored — getMe() can be used as a fallback if the backend
        // didn't include the user object in the login response.
        return response.user ?: api.getMe()
    }

    suspend fun loginWithGoogle(idToken: String): UserDto {
        val response = api.googleSignIn(GoogleSignInRequest(idToken))
        tokenDataStore.accessToken = response.accessToken
        tokenDataStore.saveRefreshToken(response.refreshToken)
        return response.user ?: api.getMe()
    }

    suspend fun register(name: String, email: String, password: String): UserDto {
        val response = api.register(RegisterRequest(name, email, password))
        tokenDataStore.accessToken = response.accessToken
        tokenDataStore.saveRefreshToken(response.refreshToken)
        return response.user ?: api.getMe()
    }

    suspend fun refreshSession(): UserDto? {
        val refreshToken = tokenDataStore.getRefreshToken() ?: return null
        return try {
            val response = api.refresh(RefreshRequest(refreshToken))
            tokenDataStore.accessToken = response.accessToken
            response.refreshToken?.let { tokenDataStore.saveRefreshToken(it) }
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
}
