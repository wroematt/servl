package com.servl.app.ui.pets

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.servl.app.data.network.dto.FeedEventDto
import com.servl.app.data.network.dto.PetDto
import com.servl.app.data.network.dto.PetStatsDto
import com.servl.app.data.repository.FeedRepository
import com.servl.app.data.repository.PetRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneOffset
import javax.inject.Inject

@HiltViewModel
class PetViewModel @Inject constructor(
    private val petRepository: PetRepository,
    private val feedRepository: FeedRepository,
) : ViewModel() {

    private val _pets = MutableStateFlow<List<PetDto>>(emptyList())
    val pets: StateFlow<List<PetDto>> = _pets.asStateFlow()

    private val _selectedPet = MutableStateFlow<PetDto?>(null)
    val selectedPet: StateFlow<PetDto?> = _selectedPet.asStateFlow()

    private val _feedHistory = MutableStateFlow<List<FeedEventDto>>(emptyList())
    val feedHistory: StateFlow<List<FeedEventDto>> = _feedHistory.asStateFlow()

    private val _feedTotal = MutableStateFlow(0)
    val feedTotal: StateFlow<Int> = _feedTotal.asStateFlow()

    private val _feedPage = MutableStateFlow(1)
    val feedPage: StateFlow<Int> = _feedPage.asStateFlow()

    private val _stats = MutableStateFlow<List<PetStatsDto>>(emptyList())
    val stats: StateFlow<List<PetStatsDto>> = _stats.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    fun loadPets() {
        viewModelScope.launch {
            _isLoading.value = true
            try { _pets.value = petRepository.getPets() } catch (e: Exception) { _error.value = e.message }
            finally { _isLoading.value = false }
        }
    }

    fun loadPet(petId: String) {
        viewModelScope.launch { fetchPet(petId) }
    }

    /** Suspending fetch — shared by [loadPet] and [pollPendingFeed] so the latter can await each refresh. */
    private suspend fun fetchPet(petId: String) {
        try { _selectedPet.value = petRepository.getPet(petId) } catch (e: Exception) { _error.value = e.message }
    }

    /**
     * Polls the pet endpoint every 4s while its feed is still 'pending', so the
     * Meal/Snack buttons re-enable promptly once the device confirms — or once
     * the worker's 30s timeout sweep flips the stuck feed_event to 'timeout'.
     * Capped at 10 attempts (~40s), comfortably past the 30s timeout, so a
     * persistently-stuck state doesn't poll forever.
     */
    private suspend fun pollPendingFeed(petId: String) {
        repeat(10) {
            delay(4_000)
            fetchPet(petId)
            if (_selectedPet.value?.has_pending_feed != true) return
        }
    }

    fun loadFeedHistory(petId: String, page: Int = 1) {
        viewModelScope.launch {
            try {
                val resp = petRepository.getFeedHistory(petId, page = page, pageSize = 20)
                _feedHistory.value = resp.data
                _feedTotal.value   = resp.total
                _feedPage.value    = page
            } catch (e: Exception) { _error.value = e.message }
        }
    }

    fun loadStats(petId: String) {
        viewModelScope.launch {
            val today = LocalDate.now(ZoneOffset.UTC)
            val from  = today.minusDays(29).atStartOfDay().toInstant(ZoneOffset.UTC).toString()
            val to    = today.plusDays(1).atStartOfDay().minusNanos(1).toInstant(ZoneOffset.UTC).toString()
            try { _stats.value = petRepository.getPetStats(petId, from, to) } catch (e: Exception) { _error.value = e.message }
        }
    }

    fun createPet(
        name: String, type: String, mealWeightG: Int, snackWeightG: Int, dailyTargetG: Int,
        photoUri: Uri?, deviceId: String? = null,
        onSuccess: () -> Unit,
    ) {
        viewModelScope.launch {
            _error.value = null
            try {
                petRepository.createPet(name, type, mealWeightG, snackWeightG, dailyTargetG, photoUri, deviceId)
                loadPets()
                onSuccess()
            } catch (e: Exception) { _error.value = e.message ?: "Failed to create pet" }
        }
    }

    fun updatePet(
        petId: String, name: String, type: String, mealWeightG: Int, snackWeightG: Int, dailyTargetG: Int,
        photoUri: Uri?, deviceId: String? = null,
        onSuccess: () -> Unit,
    ) {
        viewModelScope.launch {
            _error.value = null
            try {
                petRepository.updatePet(petId, name, type, mealWeightG, snackWeightG, dailyTargetG, photoUri, deviceId)
                loadPet(petId)
                onSuccess()
            } catch (e: Exception) { _error.value = e.message ?: "Failed to update pet" }
        }
    }

    fun deletePet(petId: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            try { petRepository.deletePet(petId); onSuccess() } catch (e: Exception) { _error.value = e.message }
        }
    }

    fun feedMeal(petId: String)  { viewModelScope.launch { try { feedRepository.feedMeal(petId);  fetchPet(petId); pollPendingFeed(petId) } catch (e: Exception) { _error.value = e.message } } }
    fun feedSnack(petId: String) { viewModelScope.launch { try { feedRepository.feedSnack(petId); fetchPet(petId); pollPendingFeed(petId) } catch (e: Exception) { _error.value = e.message } } }

    fun clearError() { _error.value = null }
}
