package com.servl.app.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import com.google.gson.Gson
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Handles the full BLE provisioning flow for Servl ESP32 devices.
 *
 * Usage:
 *  1. Call [startScan] to discover nearby Servl devices in provisioning mode.
 *  2. Call [provision] with the selected device + credentials to run the GATT write sequence.
 *
 * All GATT operations are serialized — BLE does not support pipelining writes.
 * A Channel<GattEvent> bridges the callback-based GATT API into coroutines.
 */
@SuppressLint("MissingPermission")  // Permissions checked in ProvisionViewModel before calling
class BleProvisioner(private val context: Context) {

    data class ScannedDevice(val name: String, val address: String, val rssi: Int)

    private sealed class GattEvent {
        data class Connected(val gatt: BluetoothGatt) : GattEvent()
        object Disconnected : GattEvent()
        object ServicesDiscovered : GattEvent()
        data class CharacteristicWritten(val success: Boolean) : GattEvent()
        data class NotificationReceived(val value: String) : GattEvent()
    }

    private val _scannedDevices = MutableStateFlow<List<ScannedDevice>>(emptyList())
    val scannedDevices: StateFlow<List<ScannedDevice>> = _scannedDevices.asStateFlow()

    private var gattEventChannel = Channel<GattEvent>(Channel.UNLIMITED)
    private var bluetoothGatt: BluetoothGatt? = null
    private var scanCallback: ScanCallback? = null
    private val gson = Gson()

    private val bluetoothAdapter: BluetoothAdapter? =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    // ── Scanning ─────────────────────────────────────────────────────────────

    fun startScan() {
        _scannedDevices.value = emptyList()
        val scanner = bluetoothAdapter?.bluetoothLeScanner ?: return
        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(ServlGattUuids.PROVISION_SERVICE))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val name = result.device.name ?: "Servl Feeder"
                val entry = ScannedDevice(name, result.device.address, result.rssi)
                val current = _scannedDevices.value.toMutableList()
                val idx = current.indexOfFirst { it.address == entry.address }
                if (idx >= 0) current[idx] = entry else current.add(entry)
                _scannedDevices.value = current
            }
        }
        scanner.startScan(listOf(filter), settings, scanCallback!!)
    }

    fun stopScan() {
        scanCallback?.let { bluetoothAdapter?.bluetoothLeScanner?.stopScan(it) }
        scanCallback = null
    }

    // ── Provisioning ──────────────────────────────────────────────────────────

    /**
     * Full provisioning sequence:
     *   connect → discover services → write SSID → write password → write MQTT config → commit
     *
     * @param deviceAddress BLE MAC address of the device to provision
     * @param ssid          WiFi network SSID
     * @param wifiPassword  WiFi network password
     * @param mqttBroker    MQTT broker hostname
     * @param mqttPort      MQTT broker port (default 1883 internal, 8883 external)
     * @param mqttClientId  device_{uuid} assigned by the backend
     * @param mqttUser      MQTT username
     * @param mqttPass      MQTT password
     *
     * @return "OK" on success, or an error message string on failure
     */
    suspend fun provision(
        deviceAddress: String,
        ssid: String,
        wifiPassword: String,
        mqttBroker: String,
        mqttPort: Int,
        mqttClientId: String,
        mqttUser: String,
        mqttPass: String,
    ): Result<Unit> = withContext(Dispatchers.IO) {
        gattEventChannel = Channel(Channel.UNLIMITED)

        val device = bluetoothAdapter?.getRemoteDevice(deviceAddress)
            ?: return@withContext Result.failure(Exception("Bluetooth unavailable"))

        val gattCallback = object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    gatt.discoverServices()
                    gattEventChannel.trySend(GattEvent.Connected(gatt))
                } else {
                    gattEventChannel.trySend(GattEvent.Disconnected)
                }
            }
            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                gattEventChannel.trySend(GattEvent.ServicesDiscovered)
            }
            override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
                gattEventChannel.trySend(GattEvent.CharacteristicWritten(status == BluetoothGatt.GATT_SUCCESS))
            }
            override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: android.bluetooth.BluetoothGattDescriptor, status: Int) {
                // Reuse CharacteristicWritten so the provisioning coroutine can consume it.
                gattEventChannel.trySend(GattEvent.CharacteristicWritten(status == BluetoothGatt.GATT_SUCCESS))
            }
            override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
                val value = characteristic.value?.toString(Charsets.UTF_8) ?: ""
                gattEventChannel.trySend(GattEvent.NotificationReceived(value))
            }
        }

        bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)

        try {
            // Outer timeout covers GATT setup + credential writes + device WiFi/MQTT test.
            // WiFi timeout = 15 s, MQTT timeout = 8 s → allow 40 s total.
            withTimeout(40_000) {
                // Wait for connection state change
                var event = gattEventChannel.receive()
                if (event is GattEvent.Disconnected) return@withTimeout Result.failure<Unit>(Exception("Device disconnected"))
                // Wait for services discovered
                event = gattEventChannel.receive()
                if (event !is GattEvent.ServicesDiscovered) return@withTimeout Result.failure<Unit>(Exception("Services not discovered"))

                val gatt = bluetoothGatt ?: return@withTimeout Result.failure(Exception("GATT not connected"))
                val service = gatt.getService(ServlGattUuids.PROVISION_SERVICE)
                    ?: return@withTimeout Result.failure(Exception("Provisioning service not found on device"))

                // Enable notifications on status characteristic and wait for the
                // descriptor write acknowledgement before proceeding.
                val statusChar = service.getCharacteristic(ServlGattUuids.STATUS_NOTIFY_CHAR)
                gatt.setCharacteristicNotification(statusChar, true)
                val cccd = statusChar.getDescriptor(ServlGattUuids.CCCD)
                if (cccd != null) {
                    cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    gatt.writeDescriptor(cccd)
                    // Consume the descriptor write callback so the channel stays clean.
                    gattEventChannel.receive()
                }

                // Write each characteristic in sequence (wait for write-ack between each).
                suspend fun writeChar(uuid: java.util.UUID, bytes: ByteArray): Boolean {
                    val char = service.getCharacteristic(uuid) ?: return false
                    char.value = bytes
                    char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    gatt.writeCharacteristic(char)
                    val ack = gattEventChannel.receive()
                    return ack is GattEvent.CharacteristicWritten && ack.success
                }

                if (!writeChar(ServlGattUuids.WIFI_SSID_CHAR, ssid.toByteArray())) return@withTimeout Result.failure(Exception("Failed to write SSID"))
                if (!writeChar(ServlGattUuids.WIFI_PASSWORD_CHAR, wifiPassword.toByteArray())) return@withTimeout Result.failure(Exception("Failed to write WiFi password"))

                val mqttConfig = gson.toJson(mapOf(
                    "broker" to mqttBroker, "port" to mqttPort,
                    "client_id" to mqttClientId, "user" to mqttUser, "pass" to mqttPass,
                ))
                if (!writeChar(ServlGattUuids.MQTT_CONFIG_CHAR, mqttConfig.toByteArray())) return@withTimeout Result.failure(Exception("Failed to write MQTT config"))
                if (!writeChar(ServlGattUuids.COMMIT_CHAR, byteArrayOf(0x01))) return@withTimeout Result.failure(Exception("Failed to send commit"))

                // Wait for the device to test WiFi + MQTT and notify the result.
                // The device sends "OK" on success, or "ERROR:wifi" / "ERROR:mqtt" on failure.
                // It stays connected on error so the user can correct and retry.
                val resultEvent = gattEventChannel.receive()
                when {
                    resultEvent is GattEvent.NotificationReceived && resultEvent.value == "OK" ->
                        Result.success(Unit)
                    resultEvent is GattEvent.NotificationReceived ->
                        Result.failure(Exception(resultEvent.value))   // "ERROR:wifi" or "ERROR:mqtt"
                    resultEvent is GattEvent.Disconnected ->
                        Result.failure(Exception("Device disconnected before confirming credentials"))
                    else ->
                        Result.failure(Exception("Unexpected BLE event during provisioning"))
                }
            }
        } catch (e: TimeoutCancellationException) {
            Result.failure(Exception("Provisioning timed out"))
        } finally {
            bluetoothGatt?.disconnect()
            bluetoothGatt?.close()
            bluetoothGatt = null
        }
    }

    fun close() {
        stopScan()
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
    }
}
