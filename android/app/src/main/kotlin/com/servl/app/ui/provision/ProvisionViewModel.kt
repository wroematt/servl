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
import java.util.TimeZone
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
     *
     * The serial number is derived automatically from the device's BLE MAC address
     * (colons stripped, e.g. "AA:BB:CC:DD:EE:FF" → "AABBCCDDEEFF"), so the user
     * never has to type it.
     */
    fun provision(deviceName: String, ssid: String, wifiPassword: String) {
        _step.value = ProvisionStep.PROVISIONING
        viewModelScope.launch {
            try {
                val address = _selectedAddress.value ?: throw Exception("No device selected")

                // Derive the serial number from the BLE MAC address (unique, stable, no user input).
                val serialNumber = address.replace(":", "")

                // Step 1: register in backend — response includes MQTT credentials.
                // Include the phone's IANA timezone (e.g. "Europe/London") so the
                // backend can store it on the household and the schedule worker fires
                // at the correct local time rather than UTC.
                _statusMessage.value = "Registering device…"
                val timezone = TimeZone.getDefault().id
                val device = deviceRepository.provisionDevice(deviceName, serialNumber, timezone)

                val mqttUser = device.mqtt_user
                    ?: throw Exception("Backend did not return MQTT credentials")
                val mqttPass = device.mqtt_pass
                    ?: throw Exception("Backend did not return MQTT credentials")

                // Step 2: BLE provisioning
                _statusMessage.value = "Connecting to device…"

                // Extract MQTT broker host from BASE_URL (strip scheme and port).
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
                    mqttUser      = mqttUser,
                    mqttPass      = mqttPass,
                )

                if (bleResult.isFailure) {
                    val errMsg = bleResult.exceptionOrNull()?.message ?: ""
                    // Definitive failures — the device explicitly reported an error, or
                    // credentials were never successfully delivered (write failed, connect
                    // failed before any data was sent). No point polling the backend.
                    val isDefinitiveFailure = errMsg.startsWith("ERROR:") ||
                        errMsg.startsWith("Failed to write") ||
                        errMsg.startsWith("Device disconnected — ensure") ||
                        errMsg == "Bluetooth unavailable" ||
                        errMsg == "Services not discovered" ||
                        errMsg == "Provisioning service not found on device" ||
                        // 80 s elapsed with no indication at all — something is seriously
                        // wrong at the BLE level (device crashed, radio permanently stuck,
                        // etc.). Don't fall through to backend polling.
                        errMsg == "Provisioning timed out"
                    if (isDefinitiveFailure) {
                        val displayMsg = when (errMsg) {
                            "ERROR:wifi" -> "Could not connect to WiFi — check your network name and password"
                            "ERROR:mqtt" -> "WiFi connected but could not reach the MQTT broker — check the broker address"
                            else         -> errMsg
                        }
                        throw Exception(displayMsg)
                    }
                    // BLE signal was lost after all credentials were written. This is
                    // normal on ESP32: the WiFi test for the credentials starves the BLE
                    // radio so the indication never reaches Android. The device likely
                    // received everything, saved it, and is rebooting to connect to MQTT.
                    // Fall through to backend polling below — the heartbeat it publishes
                    // on boot is the authoritative confirmation.
                }

                // Step 3: poll GET /devices/{id} until status == "online".
                // Runs whether BLE succeeded (fast path — device confirmed via indication)
                // or fell through from a radio-contention disconnect (reliable path via
                // backend heartbeat, typically arrives within 10 s of device reboot).
                _statusMessage.value = if (bleResult.isSuccess) {
                    "Waiting for device to connect…"
                } else {
                    "BLE signal lost — checking if device connected to network…"
                }
                var pollingSucceeded = false
                try {
                    withTimeout(60_000) {
                        while (true) {
                            delay(3_000)
                            val updated = deviceRepository.getDevice(device.id)
                            if (updated.status == "online") {
                                _provisionedDevice.value = updated
                                pollingSucceeded = true
                                _step.value = ProvisionStep.SUCCESS
                                return@withTimeout
                            }
                        }
                    }
                } catch (_: kotlinx.coroutines.TimeoutCancellationException) { }

                if (!pollingSucceeded) {
                    throw Exception("Device did not come online — check your WiFi credentials and that the device has power")
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
