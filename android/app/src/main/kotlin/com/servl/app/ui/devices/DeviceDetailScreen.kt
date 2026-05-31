package com.servl.app.ui.devices

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
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
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeviceDetailScreen(
    deviceId: String,
    authViewModel: AuthViewModel,
    onNavigateBack: () -> Unit,
    viewModel: DeviceViewModel = hiltViewModel(),
) {
    val device by viewModel.selectedDevice.collectAsState()
    val events by viewModel.events.collectAsState()
    val authState by authViewModel.authState.collectAsState()
    val isOwner = (authState as? AuthState.Authenticated)?.user?.role == "owner"

    val error by viewModel.error.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    var showRenameDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var newName by remember { mutableStateOf("") }

    val formatter = remember { DateTimeFormatter.ofPattern("dd MMM HH:mm").withZone(ZoneId.systemDefault()) }

    LaunchedEffect(deviceId) { viewModel.startPollingDevice(deviceId) }

    // Show errors (e.g. delete failed) as a snackbar.
    LaunchedEffect(error) {
        if (!error.isNullOrBlank()) {
            snackbarHostState.showSnackbar(error!!)
            viewModel.clearError()
        }
    }

    if (showRenameDialog) {
        AlertDialog(
            onDismissRequest = { showRenameDialog = false },
            title = { Text("Rename device") },
            text = {
                OutlinedTextField(value = newName, onValueChange = { newName = it }, label = { Text("Name") }, singleLine = true)
            },
            confirmButton = {
                TextButton(onClick = { viewModel.renameDevice(deviceId, newName); showRenameDialog = false }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { showRenameDialog = false }) { Text("Cancel") } },
        )
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Remove device?") },
            text = { Text("This will unlink the device. It will stop receiving commands.") },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    viewModel.deleteDevice(deviceId, onNavigateBack)
                }) {
                    Text("Remove", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") } },
        )
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(device?.name ?: "Device") },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                actions = {
                    if (isOwner) {
                        IconButton(onClick = { newName = device?.name ?: ""; showRenameDialog = true }) { Icon(Icons.Default.Edit, "Rename") }
                        IconButton(onClick = { showDeleteDialog = true }) { Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error) }
                    }
                },
            )
        },
    ) { padding ->
        if (device == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }

        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Card {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        HopperIndicator(pct = device!!.hopper_pct, modifier = Modifier.size(64.dp))
                        Spacer(Modifier.width(16.dp))
                        Column {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(device!!.name, style = MaterialTheme.typography.titleMedium)
                                StatusChip(device!!.status)
                            }
                            Text("Hopper: ${device!!.hopper_pct}%", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                            device!!.firmware_version?.let { Text("Firmware: $it", style = MaterialTheme.typography.bodySmall, color = TextSecondary) }
                            device!!.last_seen_at?.let {
                                val lastSeen = runCatching { formatter.format(Instant.parse(it)) }.getOrDefault(it)
                                Text("Last seen: $lastSeen", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                            }
                        }
                    }
                }
            }

            item { Text("Recent events", style = MaterialTheme.typography.titleSmall) }

            if (events.isEmpty()) {
                item { Text("No events recorded.", color = TextSecondary, style = MaterialTheme.typography.bodySmall) }
            }

            items(events) { event ->
                val time = runCatching { formatter.format(Instant.parse(event.created_at)) }.getOrDefault("--")
                ListItem(
                    headlineContent = { Text(event.event_type.replace("_", " ").replaceFirstChar { it.uppercase() }) },
                    overlineContent = { Text(time, style = MaterialTheme.typography.labelSmall, color = TextSecondary) },
                )
                HorizontalDivider()
            }
        }
    }
}
