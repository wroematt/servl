package com.servl.app.ui.provision

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.servl.app.ble.BlePermissions
import com.servl.app.ui.theme.Success
import com.servl.app.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProvisionScreen(
    onSuccess: () -> Unit,
    onCancel: () -> Unit,
    viewModel: ProvisionViewModel = hiltViewModel(),
) {
    val step by viewModel.step.collectAsState()
    val scannedDevices by viewModel.scannedDevices.collectAsState()
    val statusMessage by viewModel.statusMessage.collectAsState()
    val provisionedDevice by viewModel.provisionedDevice.collectAsState()

    // Request BLE permissions on entry
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.values.all { it }) viewModel.startScan()
    }

    LaunchedEffect(Unit) {
        permissionLauncher.launch(BlePermissions.required())
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add Device") },
                navigationIcon = { IconButton(onClick = onCancel) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (step) {
                ProvisionStep.SCAN -> ScanStep(
                    devices = scannedDevices,
                    onDeviceSelected = { viewModel.selectDevice(it) },
                )
                ProvisionStep.CREDENTIALS -> CredentialsStep(
                    onConnect = { name, ssid, pass -> viewModel.provision(name, ssid, pass) },
                    onBack = { viewModel.reset() },
                )
                ProvisionStep.PROVISIONING -> ProgressStep(message = statusMessage)
                ProvisionStep.SUCCESS -> SuccessStep(
                    deviceName = provisionedDevice?.name ?: "Device",
                    onDone = onSuccess,
                )
                ProvisionStep.ERROR -> ErrorStep(
                    message = statusMessage,
                    onRetry = { viewModel.reset() },
                    onCancel = onCancel,
                )
            }
        }
    }
}

@Composable
private fun ScanStep(
    devices: List<com.servl.app.ble.BleProvisioner.ScannedDevice>,
    onDeviceSelected: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        // Instructions
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Prepare your feeder", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Hold the button on your Servl feeder for 3 seconds until the LED blinks blue. The device will appear in the list below.",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary,
                )
            }
        }

        Spacer(Modifier.height(16.dp))
        Text("Nearby devices", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))

        if (devices.isEmpty()) {
            Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp))
                    Spacer(Modifier.height(8.dp))
                    Text("Scanning…", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
            }
        }

        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(devices) { device ->
                Card(modifier = Modifier.fillMaxWidth().clickable { onDeviceSelected(device.address) }) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(device.name, style = MaterialTheme.typography.bodyMedium)
                            Text(device.address, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                        }
                        Text("${device.rssi} dBm", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                    }
                }
            }
        }
    }
}

@Composable
private fun CredentialsStep(
    onConnect: (deviceName: String, ssid: String, wifiPassword: String) -> Unit,
    onBack: () -> Unit,
) {
    var deviceName by remember { mutableStateOf("") }
    var ssid by remember { mutableStateOf("") }
    var wifiPassword by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Device details", style = MaterialTheme.typography.titleSmall)

        OutlinedTextField(value = deviceName, onValueChange = { deviceName = it }, label = { Text("Device name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)

        HorizontalDivider()
        Text("WiFi network", style = MaterialTheme.typography.titleSmall)

        OutlinedTextField(value = ssid, onValueChange = { ssid = it }, label = { Text("Network name (SSID)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
        OutlinedTextField(
            value = wifiPassword,
            onValueChange = { wifiPassword = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) { Text("Back") }
            Button(
                onClick = { onConnect(deviceName, ssid, wifiPassword) },
                modifier = Modifier.weight(1f),
                enabled = deviceName.isNotBlank() && ssid.isNotBlank(),
            ) { Text("Connect") }
        }
    }
}

@Composable
private fun ProgressStep(message: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            CircularProgressIndicator()
            Text(message, style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
        }
    }
}

@Composable
private fun SuccessStep(deviceName: String, onDone: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(32.dp)) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Success, modifier = Modifier.size(64.dp))
            Text("$deviceName is online!", style = MaterialTheme.typography.headlineSmall)
            Text("Your feeder is connected and ready to use.", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
            Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("Done") }
        }
    }
}

@Composable
private fun ErrorStep(message: String, onRetry: () -> Unit, onCancel: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(32.dp)) {
            Icon(Icons.Default.Error, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(64.dp))
            Text("Provisioning failed", style = MaterialTheme.typography.headlineSmall)
            Text(message, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) { Text("Try again") }
            OutlinedButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) { Text("Cancel") }
        }
    }
}
