package com.servl.app.ui.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import coil3.compose.AsyncImage
import com.servl.app.ui.auth.AuthState
import com.servl.app.ui.auth.AuthViewModel
import com.servl.app.ui.components.HopperIndicator
import com.servl.app.ui.components.StatusChip
import com.servl.app.ui.components.feedTypeIcon
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
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val authState by authViewModel.authState.collectAsState()
    val user = (authState as? AuthState.Authenticated)?.user
    val pets by viewModel.pets.collectAsState()
    val devices by viewModel.devices.collectAsState()
    val todayFeeds by viewModel.todayFeeds.collectAsState()
    val feedError by viewModel.feedError.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    // Refresh every time this screen becomes visible (initial load + back-navigation)
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) viewModel.load()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Pull-to-refresh state — reset when the background load completes
    var isRefreshing by remember { mutableStateOf(false) }
    LaunchedEffect(isLoading) { if (!isLoading) isRefreshing = false }

    val timeFormatter = remember { DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()) }

    Scaffold(
        topBar = {
            // Custom header: white Surface so status-bar icons (battery, signal) are
            // always visible as dark marks against a light background.
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp,
            ) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                ) {
                    AsyncImage(
                        model = "file:///android_asset/servl-logo-banner.svg",
                        contentDescription = "Servl",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxWidth(0.5f)
                            .align(Alignment.Center),
                    )
                }
            }
        },
    ) { innerPadding ->
        // Full-screen spinner only on the very first load (no data yet)
        if (isLoading && pets.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }

        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = { isRefreshing = true; viewModel.load() },
            modifier = Modifier.fillMaxSize().padding(innerPadding),
        ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {

            // ── Greeting ──────────────────────────────────────────────────────
            item {
                val firstName = user?.name?.split(" ")?.firstOrNull() ?: ""
                Text("Hello, $firstName", style = MaterialTheme.typography.titleLarge)
            }

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
                                // Pet name + today's progress stacked on the left
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(pet.name, style = MaterialTheme.typography.bodyMedium)
                                    Text(
                                        "${pet.today_intake_g}g / ${pet.daily_target_g}g",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = TextSecondary,
                                    )
                                }
                                // Filled meal button
                                Button(
                                    onClick = { viewModel.feedMeal(pet.id) },
                                    enabled = pet.device_id != null,
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                                    modifier = Modifier.height(36.dp),
                                ) {
                                    Icon(feedTypeIcon("meal"), contentDescription = "Meal", modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("${pet.meal_weight_g}g", style = MaterialTheme.typography.labelSmall)
                                }
                                Spacer(Modifier.width(6.dp))
                                // Outlined snack button
                                OutlinedButton(
                                    onClick = { viewModel.feedSnack(pet.id) },
                                    enabled = pet.device_id != null,
                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp),
                                    modifier = Modifier.height(36.dp),
                                ) {
                                    Icon(feedTypeIcon("snack"), contentDescription = "Snack", modifier = Modifier.size(14.dp))
                                    Spacer(Modifier.width(4.dp))
                                    Text("${pet.snack_weight_g}g", style = MaterialTheme.typography.labelSmall)
                                }
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
                val time = remember(event.dispensed_at) {
                    runCatching { timeFormatter.format(Instant.parse(event.dispensed_at)) }.getOrDefault("--:--")
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
        } // end PullToRefreshBox
    }
}
