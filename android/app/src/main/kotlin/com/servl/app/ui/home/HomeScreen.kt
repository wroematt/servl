package com.servl.app.ui.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
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
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    authViewModel: AuthViewModel,
    onNavigateToPetDetail: (String) -> Unit,
    onNavigateToDevices: () -> Unit,
    onNavigateToSettings: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val authState by authViewModel.authState.collectAsState()
    val user = (authState as? AuthState.Authenticated)?.user
    val pets by viewModel.pets.collectAsState()
    val devices by viewModel.devices.collectAsState()
    val todayFeeds by viewModel.todayFeeds.collectAsState()
    val feedError by viewModel.feedError.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    val timeFormatter = remember { DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        val firstName = user?.name?.split(" ")?.firstOrNull() ?: ""
                        Text("Hello, $firstName", style = MaterialTheme.typography.titleLarge)
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToSettings) {
                        Icon(Icons.Default.Settings, contentDescription = "Settings")
                    }
                },
            )
        },
    ) { innerPadding ->
        if (isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(innerPadding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {

            // ── Quick Feed panel ──────────────────────────────────────────────
            item {
                Card {
                    Column(Modifier.padding(16.dp)) {
                        Text("Quick Feed", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(12.dp))

                        if (pets.isEmpty()) {
                            Text("No pets yet. Add a pet to get started.", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                        }

                        pets.forEach { pet ->
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(pet.name, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    "${pet.today_intake_g}g / ${pet.daily_target_g}g",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextSecondary,
                                    modifier = Modifier.padding(end = 8.dp),
                                )
                                OutlinedButton(
                                    onClick = { viewModel.feedMeal(pet.id) },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                    modifier = Modifier.height(32.dp),
                                ) { Text("Meal", style = MaterialTheme.typography.labelSmall) }
                                Spacer(Modifier.width(4.dp))
                                OutlinedButton(
                                    onClick = { viewModel.feedSnack(pet.id) },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                                    modifier = Modifier.height(32.dp),
                                ) { Text("Snack", style = MaterialTheme.typography.labelSmall) }
                            }
                        }

                        feedError?.let {
                            Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            // ── Today's feeds ─────────────────────────────────────────────────
            item {
                Card {
                    Column(Modifier.padding(16.dp)) {
                        Text("Today's feeds", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(8.dp))
                        if (todayFeeds.isEmpty()) {
                            Text("No feeds today yet.", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }

            items(todayFeeds) { event ->
                val time = remember(event.created_at) {
                    runCatching { timeFormatter.format(Instant.parse(event.created_at)) }.getOrDefault("--:--")
                }
                val petName = pets.find { it.id == event.pet_id }?.name ?: "Unknown"
                ListItem(
                    headlineContent = { Text(petName) },
                    supportingContent = { Text("${event.trigger_type} · ${event.weight_requested_g}g") },
                    trailingContent = {
                        Column(horizontalAlignment = Alignment.End) {
                            Text(time, style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                            StatusChip(event.status)
                        }
                    },
                )
            }

            // ── Devices ───────────────────────────────────────────────────────
            item {
                Card {
                    Column(Modifier.padding(16.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text("Devices", style = MaterialTheme.typography.titleMedium)
                            TextButton(onClick = onNavigateToDevices) { Text("See all") }
                        }
                        Spacer(Modifier.height(8.dp))
                        if (devices.isEmpty()) {
                            Text("No devices provisioned.", color = TextSecondary, style = MaterialTheme.typography.bodySmall)
                        }
                        devices.forEach { device ->
                            Row(
                                Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                HopperIndicator(pct = device.hopper_pct, modifier = Modifier.size(32.dp))
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(device.name, style = MaterialTheme.typography.bodyMedium)
                                    Text("${device.hopper_pct}% hopper", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                                }
                                StatusChip(device.status)
                            }
                        }
                    }
                }
            }
        }
    }
}
