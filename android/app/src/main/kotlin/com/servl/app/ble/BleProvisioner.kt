package com.servl.app.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import androidx.annotation.RequiresApi
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
 *
 * Logcat filter: tag:ServlBLE
 */
@SuppressLint("MissingPermission")  // Permissions checked in ProvisionViewModel before calling
class BleProvisioner(private val context: Context) {

    companion object {
        private const val TAG = "ServlBLE"
    }

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

        Log.i(TAG, "=== provision() start  device=$deviceAddress ===")
        Log.i(TAG, "Android SDK=${Build.VERSION.SDK_INT}")

        // ── Step 0: release any stale GATT ───────────────────────────────────
        if (bluetoothGatt != null) {
            Log.w(TAG, "Step 0: stale GATT present — disconnecting and closing")
            bluetoothGatt?.apply { disconnect(); close() }
            bluetoothGatt = null
        }

        val device = bluetoothAdapter?.getRemoteDevice(deviceAddress)
            ?: return@withContext Result.failure(Exception("Bluetooth unavailable"))

        gattEventChannel = Channel(Channel.UNLIMITED)

        val gattCallback = object : BluetoothGattCallback() {

            override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
                val stateStr = when (newState) {
                    BluetoothProfile.STATE_CONNECTED    -> "CONNECTED"
                    BluetoothProfile.STATE_DISCONNECTED -> "DISCONNECTED"
                    BluetoothProfile.STATE_CONNECTING   -> "CONNECTING"
                    else                                -> "UNKNOWN($newState)"
                }
                Log.i(TAG, "onConnectionStateChange  status=$status  newState=$stateStr")
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    Log.i(TAG, "  → sending Connected event")
                    gattEventChannel.trySend(GattEvent.Connected(gatt))
                } else {
                    Log.i(TAG, "  → sending Disconnected event")
                    gattEventChannel.trySend(GattEvent.Disconnected)
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
                val statusStr = if (status == BluetoothGatt.GATT_SUCCESS) "SUCCESS" else "FAILURE($status)"
                Log.i(TAG, "onServicesDiscovered  status=$statusStr")
                val serviceList = gatt.services.joinToString { it.uuid.toString() }
                Log.d(TAG, "  services: $serviceList")
                gattEventChannel.trySend(GattEvent.ServicesDiscovered)
            }

            override fun onCharacteristicWrite(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                status: Int
            ) {
                val success = status == BluetoothGatt.GATT_SUCCESS
                Log.i(TAG, "onCharacteristicWrite  uuid=${characteristic.uuid}  status=$status  success=$success")
                gattEventChannel.trySend(GattEvent.CharacteristicWritten(success))
            }

            override fun onDescriptorWrite(
                gatt: BluetoothGatt,
                descriptor: android.bluetooth.BluetoothGattDescriptor,
                status: Int
            ) {
                val success = status == BluetoothGatt.GATT_SUCCESS
                Log.i(TAG, "onDescriptorWrite  char=${descriptor.characteristic.uuid}  desc=${descriptor.uuid}  status=$status  success=$success")
                gattEventChannel.trySend(GattEvent.CharacteristicWritten(success))
            }

            // API < 33
            @Suppress("DEPRECATION")
            override fun onCharacteristicChanged(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic
            ) {
                val rawBytes = characteristic.value
                val hex = rawBytes?.joinToString(" ") { "%02X".format(it) } ?: "<null>"
                val str = rawBytes?.decodeToString()?.trim() ?: ""
                val uuidMatch = characteristic.uuid == ServlGattUuids.STATUS_NOTIFY_CHAR
                Log.i(TAG, "onCharacteristicChanged(legacy)  uuid=${characteristic.uuid}  expectedUuid=${ServlGattUuids.STATUS_NOTIFY_CHAR}  uuidMatch=$uuidMatch  hex=[$hex]  str='$str'  SDK=${Build.VERSION.SDK_INT}")

                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                    if (!uuidMatch) {
                        Log.w(TAG, "  → UUID mismatch — dropping (not our status char)")
                        return
                    }
                    Log.i(TAG, "  → sending NotificationReceived('$str')")
                    gattEventChannel.trySend(GattEvent.NotificationReceived(str))
                }
                // On API 33+ this override fires but does nothing — the versioned override below handles it.
            }

            // API 33+
            @RequiresApi(Build.VERSION_CODES.TIRAMISU)
            override fun onCharacteristicChanged(
                gatt: BluetoothGatt,
                characteristic: BluetoothGattCharacteristic,
                value: ByteArray
            ) {
                val hex = value.joinToString(" ") { "%02X".format(it) }
                val str = value.decodeToString().trim()
                val uuidMatch = characteristic.uuid == ServlGattUuids.STATUS_NOTIFY_CHAR
                Log.i(TAG, "onCharacteristicChanged(API33+)  uuid=${characteristic.uuid}  expectedUuid=${ServlGattUuids.STATUS_NOTIFY_CHAR}  uuidMatch=$uuidMatch  hex=[$hex]  str='$str'")

                if (!uuidMatch) {
                    Log.w(TAG, "  → UUID mismatch — dropping")
                    return
                }
                Log.i(TAG, "  → sending NotificationReceived('$str')")
                gattEventChannel.trySend(GattEvent.NotificationReceived(str))
            }
        }

        Log.i(TAG, "Step 1: calling connectGatt()")
        bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)

        try {
            withTimeout(80_000) {
                // ── Step 1: wait for connection ───────────────────────────────
                Log.i(TAG, "Step 1: waiting for Connected event…")
                var event = gattEventChannel.receive()
                Log.i(TAG, "Step 1: received ${event::class.simpleName}")

                if (event is GattEvent.Disconnected) {
                    Log.w(TAG, "Step 1: Disconnected on first attempt — likely GATT error 133. Retrying after 1500 ms…")
                    bluetoothGatt?.close()
                    bluetoothGatt = null
                    delay(1500)
                    var drained = 0
                    while (gattEventChannel.tryReceive().isSuccess) { drained++ }
                    Log.i(TAG, "Step 1: drained $drained stale channel events before retry")
                    bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
                    Log.i(TAG, "Step 1: retry connectGatt() issued — waiting again…")
                    event = gattEventChannel.receive()
                    Log.i(TAG, "Step 1: retry received ${event::class.simpleName}")
                }

                if (event is GattEvent.Disconnected) {
                    Log.e(TAG, "Step 1: Disconnected again after retry — aborting")
                    return@withTimeout Result.failure<Unit>(Exception("Device disconnected — ensure Bluetooth is enabled and the device is in provisioning mode"))
                }

                val gatt = (event as GattEvent.Connected).gatt
                Log.i(TAG, "Step 1: connected ✓")

                // ── Step 2: discover services ─────────────────────────────────
                Log.i(TAG, "Step 2: delaying 300 ms then discoverServices()")
                delay(300)
                gatt.discoverServices()

                Log.i(TAG, "Step 2: waiting for ServicesDiscovered…")
                event = gattEventChannel.receive()
                Log.i(TAG, "Step 2: received ${event::class.simpleName}")
                if (event !is GattEvent.ServicesDiscovered) {
                    Log.e(TAG, "Step 2: unexpected event — aborting")
                    return@withTimeout Result.failure<Unit>(Exception("Services not discovered"))
                }

                val service = gatt.getService(ServlGattUuids.PROVISION_SERVICE)
                if (service == null) {
                    Log.e(TAG, "Step 2: PROVISION_SERVICE not found on device")
                    return@withTimeout Result.failure(Exception("Provisioning service not found on device"))
                }
                Log.i(TAG, "Step 2: provisioning service found ✓")

                // ── Step 3: subscribe to indications ─────────────────────────
                val statusChar = service.getCharacteristic(ServlGattUuids.STATUS_NOTIFY_CHAR)
                if (statusChar == null) {
                    Log.e(TAG, "Step 3: STATUS_NOTIFY_CHAR not found in service")
                } else {
                    Log.i(TAG, "Step 3: STATUS_NOTIFY_CHAR found — properties=0x%02X".format(statusChar.properties))
                }
                gatt.setCharacteristicNotification(statusChar, true)
                val cccd = statusChar?.getDescriptor(ServlGattUuids.CCCD)
                if (cccd != null) {
                    Log.i(TAG, "Step 3: writing ENABLE_INDICATION_VALUE to CCCD")
                    @Suppress("DEPRECATION")
                    cccd.value = BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                    @Suppress("DEPRECATION")
                    gatt.writeDescriptor(cccd)
                    val ack = gattEventChannel.receive()
                    val ackOk = ack is GattEvent.CharacteristicWritten && ack.success
                    Log.i(TAG, "Step 3: CCCD write ack=${ack::class.simpleName}  success=$ackOk")
                } else {
                    Log.w(TAG, "Step 3: CCCD descriptor not found — skipping subscription")
                }

                // ── Step 4: write each credential ────────────────────────────
                @Suppress("DEPRECATION")
                suspend fun writeChar(uuid: java.util.UUID, label: String, bytes: ByteArray): Boolean {
                    Log.i(TAG, "Step 4: writing $label  uuid=$uuid  len=${bytes.size}")
                    val char = service.getCharacteristic(uuid)
                    if (char == null) {
                        Log.e(TAG, "Step 4: characteristic $label not found")
                        return false
                    }
                    char.value = bytes
                    char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    @Suppress("DEPRECATION")
                    gatt.writeCharacteristic(char)
                    val ack = gattEventChannel.receive()
                    val ok = ack is GattEvent.CharacteristicWritten && ack.success
                    Log.i(TAG, "Step 4: $label ack=${ack::class.simpleName}  success=$ok")
                    return ok
                }

                if (!writeChar(ServlGattUuids.WIFI_SSID_CHAR,     "SSID",       ssid.toByteArray()))           return@withTimeout Result.failure(Exception("Failed to write SSID"))
                if (!writeChar(ServlGattUuids.WIFI_PASSWORD_CHAR, "WiFiPass",   wifiPassword.toByteArray()))    return@withTimeout Result.failure(Exception("Failed to write WiFi password"))
                val mqttConfig = gson.toJson(mapOf(
                    "broker" to mqttBroker, "port" to mqttPort,
                    "client_id" to mqttClientId, "user" to mqttUser, "pass" to mqttPass,
                ))
                if (!writeChar(ServlGattUuids.MQTT_CONFIG_CHAR,   "MQTTConfig", mqttConfig.toByteArray()))      return@withTimeout Result.failure(Exception("Failed to write MQTT config"))
                if (!writeChar(ServlGattUuids.COMMIT_CHAR,        "Commit",     byteArrayOf(0x01)))              return@withTimeout Result.failure(Exception("Failed to send commit"))

                Log.i(TAG, "Step 4: all writes complete — waiting for device result indication…")

                // ── Step 5: wait for indication result ───────────────────────
                var resultEvent: GattEvent
                var loopCount = 0
                do {
                    resultEvent = gattEventChannel.receive()
                    loopCount++
                    Log.i(TAG, "Step 5 [loop #$loopCount]: received ${resultEvent::class.simpleName}" +
                        if (resultEvent is GattEvent.NotificationReceived) "  value='${resultEvent.value}'" else "")
                } while (
                    resultEvent is GattEvent.NotificationReceived &&
                    resultEvent.value != "OK" &&
                    !resultEvent.value.startsWith("ERROR:")
                )

                // Drain safety net — if disconnect arrived before the indication
                if (resultEvent is GattEvent.Disconnected) {
                    Log.w(TAG, "Step 5: Disconnected arrived before indication — draining channel for buffered result")
                    var drainCount = 0
                    var drained = gattEventChannel.tryReceive()
                    while (drained.isSuccess) {
                        drainCount++
                        val evt = drained.getOrNull()
                        Log.i(TAG, "Step 5: drain[$drainCount] = ${evt?.let { it::class.simpleName }}")
                        if (evt is GattEvent.NotificationReceived &&
                            (evt.value == "OK" || evt.value.startsWith("ERROR:"))) {
                            Log.i(TAG, "Step 5: found buffered result '${evt.value}' after disconnect")
                            resultEvent = evt
                            break
                        }
                        drained = gattEventChannel.tryReceive()
                    }
                    if (resultEvent is GattEvent.Disconnected) {
                        Log.e(TAG, "Step 5: drain found no valid result — indication was never received")
                    }
                }

                Log.i(TAG, "Step 5: final resultEvent=${resultEvent::class.simpleName}" +
                    if (resultEvent is GattEvent.NotificationReceived) "  value='${resultEvent.value}'" else "")

                when {
                    resultEvent is GattEvent.NotificationReceived && resultEvent.value == "OK" -> {
                        Log.i(TAG, "=== provision() SUCCESS ===")
                        Result.success(Unit)
                    }
                    resultEvent is GattEvent.NotificationReceived -> {
                        Log.e(TAG, "=== provision() DEVICE ERROR: ${resultEvent.value} ===")
                        Result.failure(Exception(resultEvent.value))
                    }
                    resultEvent is GattEvent.Disconnected -> {
                        Log.e(TAG, "=== provision() FAIL: disconnected before confirmation ===")
                        Result.failure(Exception("Device disconnected before confirming credentials"))
                    }
                    else -> {
                        Log.e(TAG, "=== provision() FAIL: unexpected event ${resultEvent::class.simpleName} ===")
                        Result.failure(Exception("Unexpected BLE event during provisioning"))
                    }
                }
            }
        } catch (e: TimeoutCancellationException) {
            Log.e(TAG, "=== provision() TIMEOUT after 80 s ===")
            Result.failure(Exception("Provisioning timed out"))
        } finally {
            Log.i(TAG, "provision() finally: disconnecting GATT")
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
