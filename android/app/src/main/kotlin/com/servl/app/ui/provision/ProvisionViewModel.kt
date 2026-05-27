package com.servl.app.ui.provision

import android.annotation.SuppressLint
import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.servl.app.BuildConfig
import com.servl.app.ble.BleProvisioner
import com.servl.app.data.network.dto.DeviceDto
import com.servl.app.data.repository.DeviceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import javax.inject.Inject

enum class ProvisionStep { SCAN, CREDENTIALS, PROVISIONING, SUCCESS, ERROR }

@SuppressLint("MissingPermission")
@HiltViewModel
class ProvisionViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val deviceRepository: DeviceRepository,
) : ViewModel() {

    private val bleProvisioner = BleProvisioner(context)

    val scannedDevices = bleProvisioner.scannedDevices

    private val _step = MutableStateFlow(ProvisionStep.SCAN)
    val step: StateFlow<ProvisionStep> = _step.asStateFlow()

    private val _selectedAddress = MutableStateFlow<String?>(null)
    val selectedAddress: StateFlow<String?> = _selectedAddress.asStateFlow()

    private val _statusMessage = MutableStateFlow("")
    val statusMessage: StateFlow<String> = _statusMessage.asStateFlow()

    private val _provisionedDevice = MutableStateFlow<DeviceDto?>(null)
    val provisionedDevice: StateFlow<DeviceDto?> = _provisionedDevice.asStateFlow()

    fun startScan() {
        bleProvisioner.startScan()
        _step.value = ProvisionStep.SCAN
    }

    fun stopScan() = bleProvisioner.stopScan()

    fun selectDevice(address: String) {
        _selectedAddress.value = address
        bleProvisioner.stopScan()
        _step.value = ProvisionStep.CREDENTIALS
    }

    /**
     * Called when user taps "Connect" on the credentials screen.
     * 1. Registers device in the backend (POST /devices) to get MQTT credentials.
     * 2. Runs the BLE GATT write sequence.
     * 3. Polls GET /devices/{id} every 3s until status == "online" (60s timeout).
     */
    fun provision(deviceName: String, serialNumber: String, ssid: String, wifiPassword: String) {
        _step.value = ProvisionStep.PROVISIONING
        viewModelScope.launch {
            try {
                // Step 1: register in backend
                _statusMessage.value = "Registering device…"
                val device = deviceRepository.provisionDevice(deviceName, serialNumber)

                // Step 2: BLE provisioning
                _statusMessage.value = "Connecting to device…"
                val address = _selectedAddress.value ?: throw Exception("No device selected")

                // Extract MQTT broker host from BASE_URL (strip http:// prefix and port)
                val mqttBroker = BuildConfig.BASE_URL
                    .removePrefix("http://").removePrefix("https://")
                    .substringBefore(":")   // remove port if present

                val bleResult = bleProvisioner.provision(
                    deviceAddress = address,
                    ssid          = ssid,
                    wifiPassword  = wifiPassword,
                    mqttBroker    = mqttBroker,
                    mqttPort      = 1883,
                    mqttClientId  = device.mqtt_client_id,
                    mqttUser      = "internal_service", // TODO: pass via secure channel
                    mqttPass      = "",
                )

                if (bleResult.isFailure) throw bleResult.exceptionOrNull() ?: Exception("BLE provisioning failed")

                // Step 3: poll for online status
                _statusMessage.value = "Waiting for device to connect…"
                withTimeout(60_000) {
                    while (true) {
                        delay(3_000)
                        val updated = deviceRepository.getDevice(device.id)
                        if (updated.status == "online") {
                            _provisionedDevice.value = updated
                            _step.value = ProvisionStep.SUCCESS
                            return@withTimeout
                        }
                    }
                }
            } catch (e: Exception) {
                _statusMessage.value = e.message ?: "Provisioning failed"
                _step.value = ProvisionStep.ERROR
            }
        }
    }

    fun reset() {
        _step.value = ProvisionStep.SCAN
        _selectedAddress.value = null
        _statusMessage.value = ""
        _provisionedDevice.value = null
        startScan()
    }

    override fun onCleared() {
        super.onCleared()
        bleProvisioner.close()
    }
}
