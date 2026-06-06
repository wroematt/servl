package com.servl.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.servl.app.data.network.dto.DeviceDto
import com.servl.app.data.network.dto.FeedEventDto
import com.servl.app.data.network.dto.PetDto
import com.servl.app.data.repository.DeviceRepository
import com.servl.app.data.repository.FeedRepository
import com.servl.app.data.repository.PetRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val petRepository: PetRepository,
    private val deviceRepository: DeviceRepository,
    private val feedRepository: FeedRepository,
) : ViewModel() {

    private val _pets = MutableStateFlow<List<PetDto>>(emptyList())
    val pets: StateFlow<List<PetDto>> = _pets.asStateFlow()

    private val _devices = MutableStateFlow<List<DeviceDto>>(emptyList())
    val devices: StateFlow<List<DeviceDto>> = _devices.asStateFlow()

    private val _todayFeeds = MutableStateFlow<List<FeedEventDto>>(emptyList())
    val todayFeeds: StateFlow<List<FeedEventDto>> = _todayFeeds.asStateFlow()

    private val _feedError = MutableStateFlow<String?>(null)
    val feedError: StateFlow<String?> = _feedError.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    fun load() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                val petsDeferred   = async { petRepository.getPets() }
                val devicesDeferred = async { deviceRepository.getDevices() }
                _pets.value    = petsDeferred.await()
                _devices.value = devicesDeferred.await()

                // Load today's feeds for the first pet (dashboard summary)
                val allPets = _pets.value
                if (allPets.isNotEmpty()) {
                    val today = LocalDate.now(ZoneOffset.UTC)
                    val from = today.atStartOfDay().toInstant(ZoneOffset.UTC).toString()
                    val to   = today.plusDays(1).atStartOfDay().minusNanos(1).toInstant(ZoneOffset.UTC).toString()
                    val resp = petRepository.getFeedHistory(allPets[0].id, from = from, to = to, pageSize = 50)
                    _todayFeeds.value = resp.data
                }
            } catch (_: Exception) {
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun feedMeal(petId: String) {
        viewModelScope.launch {
            _feedError.value = null
            try {
                feedRepository.feedMeal(petId)
                load() // refresh feed list
            } catch (e: Exception) {
                _feedError.value = e.message ?: "Feed failed"
            }
        }
    }

    fun feedSnack(petId: String) {
        viewModelScope.launch {
            _feedError.value = null
            try {
                feedRepository.feedSnack(petId)
                load()
            } catch (e: Exception) {
                _feedError.value = e.message ?: "Feed failed"
            }
        }
    }

    fun clearFeedError() { _feedError.value = null }
}
