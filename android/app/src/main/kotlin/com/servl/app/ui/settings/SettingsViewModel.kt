package com.servl.app.ui.settings

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.servl.app.data.network.dto.HouseholdMemberDto
import com.servl.app.data.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _members = MutableStateFlow<List<HouseholdMemberDto>>(emptyList())
    val members: StateFlow<List<HouseholdMemberDto>> = _members.asStateFlow()

    // null  = still loading
    // ""    = failed to load (column missing, network error, etc.)
    // value = actual IANA timezone string
    private val _timezone = MutableStateFlow<String?>(null)
    val timezone: StateFlow<String?> = _timezone.asStateFlow()

    private val _inviteUrl = MutableStateFlow<String?>(null)
    val inviteUrl: StateFlow<String?> = _inviteUrl.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _success = MutableStateFlow<String?>(null)
    val success: StateFlow<String?> = _success.asStateFlow()

    fun loadMembers() {
        viewModelScope.launch {
            try { _members.value = userRepository.getHousehold() }
            catch (e: Exception) { _error.value = e.message }
        }
    }

    fun loadTimezone() {
        viewModelScope.launch {
            try { _timezone.value = userRepository.getHouseholdSettings().timezone }
            catch (_: Exception) { _timezone.value = "" }  // "" = load failed
        }
    }

    fun updateTimezone(timezone: String) {
        viewModelScope.launch {
            try {
                _timezone.value = userRepository.updateHouseholdTimezone(timezone).timezone
            } catch (e: Exception) {
                _error.value = e.message ?: "Failed to update timezone"
            }
        }
    }

    fun updateProfile(name: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _error.value = null
            try {
                userRepository.updateMe(name = name)
                _success.value = "Profile updated"
                onSuccess()
            } catch (e: Exception) { _error.value = e.message ?: "Failed to update profile" }
        }
    }

    fun changePassword(currentPw: String, newPw: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _error.value = null
            try {
                userRepository.updateMe(currentPw = currentPw, newPw = newPw)
                _success.value = "Password changed"
                onSuccess()
            } catch (e: Exception) { _error.value = e.message ?: "Failed to change password" }
        }
    }

    fun uploadPhoto(uri: Uri, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _error.value = null
            try {
                userRepository.uploadPhoto(uri)
                _success.value = "Photo updated"
                onSuccess()
            } catch (e: Exception) { _error.value = e.message ?: "Failed to upload photo" }
        }
    }

    fun generateInvite() {
        viewModelScope.launch {
            try { _inviteUrl.value = userRepository.generateInvite().inviteUrl }
            catch (e: Exception) { _error.value = e.message }
        }
    }

    fun updateRole(userId: String, role: String) {
        viewModelScope.launch {
            try { userRepository.updateRole(userId, role); loadMembers() }
            catch (e: Exception) { _error.value = e.message }
        }
    }

    fun removeMember(userId: String) {
        viewModelScope.launch {
            try { userRepository.removeMember(userId); loadMembers() }
            catch (e: Exception) { _error.value = e.message }
        }
    }

    fun clearMessages() { _error.value = null; _success.value = null }
}
