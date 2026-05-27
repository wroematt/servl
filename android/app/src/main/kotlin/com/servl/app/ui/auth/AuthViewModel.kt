package com.servl.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.servl.app.data.network.dto.UserDto
import com.servl.app.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class AuthState {
    object Loading : AuthState()
    object Unauthenticated : AuthState()
    data class Authenticated(val user: UserDto) : AuthState()
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Loading)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        // Attempt to restore session from persisted refresh token on cold start
        viewModelScope.launch {
            val user = authRepository.refreshSession()
            _authState.value = if (user != null) AuthState.Authenticated(user)
                               else AuthState.Unauthenticated
        }
    }

    fun login(email: String, password: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _error.value = null
            try {
                val user = authRepository.login(email, password)
                _authState.value = AuthState.Authenticated(user)
                onSuccess()
            } catch (e: Exception) {
                _error.value = e.message ?: "Login failed"
            }
        }
    }

    fun register(name: String, email: String, password: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _error.value = null
            try {
                val user = authRepository.register(name, email, password)
                _authState.value = AuthState.Authenticated(user)
                onSuccess()
            } catch (e: Exception) {
                _error.value = e.message ?: "Registration failed"
            }
        }
    }

    fun logout(onDone: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            _authState.value = AuthState.Unauthenticated
            onDone()
        }
    }

    fun refreshCurrentUser() {
        viewModelScope.launch {
            val user = authRepository.refreshSession()
            if (user != null) _authState.value = AuthState.Authenticated(user)
        }
    }

    fun clearError() { _error.value = null }

    val currentUser: UserDto?
        get() = (_authState.value as? AuthState.Authenticated)?.user
}
