package com.servl.app.ui.devices

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.servl.app.data.network.dto.DeviceDto
import com.servl.app.data.network.dto.DeviceEventDto
import com.servl.app.data.repository.DeviceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DeviceViewModel @Inject constructor(
    private val deviceRepository: DeviceRepository,
) : ViewModel() {

    private val _devices = MutableStateFlow<List<DeviceDto>>(emptyList())
    val devices: StateFlow<List<DeviceDto>> = _devices.asStateFlow()

    private val _selectedDevice = MutableStateFlow<DeviceDto?>(null)
    val selectedDevice: StateFlow<DeviceDto?> = _selectedDevice.asStateFlow()

    private val _events = MutableStateFlow<List<DeviceEventDto>>(emptyList())
    val events: StateFlow<List<DeviceEventDto>> = _events.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    // Poll devices list every 30s
    init {
        viewModelScope.launch {
            while (true) {
                try { _devices.value = deviceRepository.getDevices() } catch (_: Exception) {}
                delay(30_000)
            }
        }
    }

    // Poll a specific device every 15s
    fun startPollingDevice(deviceId: String) {
        viewModelScope.launch {
            while (true) {
                try {
                    _selectedDevice.value = deviceRepository.getDevice(deviceId)
                    val eventsResp = deviceRepository.getDeviceEvents(deviceId)
                    _events.value = eventsResp.data
                } catch (e: Exception) { _error.value = e.message }
                delay(15_000)
            }
        }
    }

    fun renameDevice(deviceId: String, name: String) {
        viewModelScope.launch {
            try {
                deviceRepository.updateDevice(deviceId, name)
                _selectedDevice.value = deviceRepository.getDevice(deviceId)
            } catch (e: Exception) { _error.value = e.message }
        }
    }

    fun deleteDevice(deviceId: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            try { deviceRepository.deleteDevice(deviceId); onSuccess() }
            catch (e: Exception) { _error.value = e.message }
        }
    }

    fun clearError() { _error.value = null }
}
