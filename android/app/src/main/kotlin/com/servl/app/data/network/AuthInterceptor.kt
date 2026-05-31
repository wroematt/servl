package com.servl.app.data.network

import com.google.gson.Gson
import com.servl.app.BuildConfig
import com.servl.app.data.local.TokenDataStore
import com.servl.app.data.network.dto.RefreshRequest
import com.servl.app.data.network.dto.RefreshResponse
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Attaches the Bearer access token to every request.
 * On 401: refreshes the access token and retries the original request once.
 *
 * Uses a Mutex so that if multiple concurrent requests all get 401 at the same time,
 * only one refresh call is made — the others wait and reuse the new token.
 *
 * Uses a secondary OkHttpClient (no interceptors) for the refresh request itself
 * to avoid infinite recursion.
 */
class AuthInterceptor(
    private val tokenDataStore: TokenDataStore,
) : okhttp3.Interceptor {

    private val refreshMutex = Mutex()
    private val gson = Gson()

    // Secondary client used only for the /auth/refresh call — no interceptors attached
    private val refreshClient = OkHttpClient.Builder().build()

    override fun intercept(chain: okhttp3.Interceptor.Chain): okhttp3.Response {
        val originalRequest = chain.request()

        // Attach current access token
        val requestWithToken = originalRequest.withBearerToken(tokenDataStore.accessToken)
        val response = chain.proceed(requestWithToken)

        if (response.code != 401) return response

        // Got 401 — attempt token refresh
        response.close()

        val newAccessToken = runBlocking {
            refreshMutex.withLock {
                // Another coroutine may have refreshed already while we were waiting for the lock
                // Try the request with the current token first
                val currentToken = tokenDataStore.accessToken
                if (currentToken != null && currentToken != tokenDataStore.accessToken) {
                    return@withLock currentToken
                }
                doRefresh()
            }
        } ?: return chain.proceed(originalRequest) // Refresh failed — let the 401 propagate

        val retryRequest = originalRequest.withBearerToken(newAccessToken)
        return chain.proceed(retryRequest)
    }

    private suspend fun doRefresh(): String? {
        val refreshToken = tokenDataStore.getRefreshToken() ?: return null

        val body = gson.toJson(RefreshRequest(refreshToken))
            .toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("${BuildConfig.BASE_URL}/auth/refresh")
            .post(body)
            .build()

        return try {
            val response = refreshClient.newCall(request).execute()
            if (!response.isSuccessful) {
                tokenDataStore.clearTokens()
                return null
            }
            val json = response.body?.string() ?: return null
            val parsed = gson.fromJson(json, RefreshResponse::class.java)
            tokenDataStore.accessToken = parsed.accessToken
            parsed.refreshToken?.let { tokenDataStore.saveRefreshToken(it) }
            parsed.accessToken
        } catch (e: Exception) {
            null
        }
    }

    private fun Request.withBearerToken(token: String?): Request =
        if (token != null) newBuilder().header("Authorization", "Bearer $token").build()
        else this
}
