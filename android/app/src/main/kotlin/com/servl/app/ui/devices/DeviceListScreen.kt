package com.servl.app.ui.devices

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.servl.app.ui.auth.AuthState
import com.servl.app.ui.auth.AuthViewModel
import com.servl.app.ui.components.HopperIndicator
import com.servl.app.ui.components.StatusChip
import com.servl.app.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceListScreen(
    authViewModel: AuthViewModel,
    onNavigateToDetail: (String) -> Unit,
    onNavigateToProvision: () -> Unit,
    viewModel: DeviceViewModel = hiltViewModel(),
) {
    val devices by viewModel.devices.collectAsState()
    val authState by authViewModel.authState.collectAsState()
    val isOwner = (authState as? AuthState.Authenticated)?.user?.role == "owner"

    // Refresh immediately whenever this screen enters the composition.
    // This covers both first entry and returning from DeviceDetailScreen after a delete.
    LaunchedEffect(Unit) { viewModel.refreshDevices() }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Devices") }) },
        floatingActionButton = {
            if (isOwner) {
                FloatingActionButton(onClick = onNavigateToProvision) {
                    Icon(Icons.Default.Add, "Add device")
                }
            }
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (devices.isEmpty()) {
                item {
                    Card {
                        Column(Modifier.padding(16.dp)) {
                            Text("No devices provisioned.", style = MaterialTheme.typography.titleSmall)
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Use the Servl app to provision a new feeder device via Bluetooth.",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary,
                            )
                        }
                    }
                }
            }

            items(devices) { device ->
                Card(modifier = Modifier.fillMaxWidth().clickable { onNavigateToDetail(device.id) }) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        HopperIndicator(pct = device.hopper_pct, modifier = Modifier.size(48.dp))
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(device.name, style = MaterialTheme.typography.titleMedium)
                                StatusChip(device.status)
                            }
                            Text("Hopper: ${device.hopper_pct}%", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                            device.firmware_version?.let {
                                Text("FW $it", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                            }
                        }
                        Icon(Icons.Default.Settings, contentDescription = null, tint = TextSecondary)
                    }
                }
            }
        }
    }
}
