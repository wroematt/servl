package com.servl.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages token persistence.
 *
 * - accessToken: in-memory only (intentionally lost on process death — 15-min tokens have no
 *   value persisted and storing them on disk is a security risk).
 * - refreshToken: stored in DataStore so sessions survive app restarts.
 */
@Singleton
class TokenDataStore @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    companion object {
        private val REFRESH_TOKEN_KEY = stringPreferencesKey("refresh_token")
    }

    // In-memory access token — cleared when the process dies
    @Volatile
    private var _accessToken: String? = null

    var accessToken: String?
        get() = _accessToken
        set(value) { _accessToken = value }

    suspend fun getRefreshToken(): String? =
        dataStore.data.map { it[REFRESH_TOKEN_KEY] }.firstOrNull()

    suspend fun saveRefreshToken(token: String) {
        dataStore.edit { it[REFRESH_TOKEN_KEY] = token }
    }

    suspend fun clearTokens() {
        _accessToken = null
        dataStore.edit { it.remove(REFRESH_TOKEN_KEY) }
    }
}
