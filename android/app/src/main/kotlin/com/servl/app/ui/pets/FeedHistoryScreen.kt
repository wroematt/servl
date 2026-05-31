package com.servl.app.ui.pets

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.servl.app.ui.components.StatusChip
import com.servl.app.ui.theme.TextSecondary
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FeedHistoryScreen(
    petId: String,
    onNavigateBack: () -> Unit,
    viewModel: PetViewModel = hiltViewModel(),
) {
    val feedHistory by viewModel.feedHistory.collectAsState()
    val feedTotal   by viewModel.feedTotal.collectAsState()
    val feedPage    by viewModel.feedPage.collectAsState()
    val pageSize = 20
    val totalPages = (feedTotal + pageSize - 1) / pageSize

    val formatter = remember { DateTimeFormatter.ofPattern("dd MMM HH:mm").withZone(ZoneId.systemDefault()) }

    LaunchedEffect(petId) { viewModel.loadFeedHistory(petId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Feed history") },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(bottom = 16.dp),
        ) {
            items(feedHistory) { event ->
                val time = runCatching { formatter.format(Instant.parse(event.dispensed_at)) }.getOrDefault("--")
                ListItem(
                    headlineContent = {
                        val label = buildString {
                            append(event.trigger_type.replaceFirstChar { it.uppercase() })
                            if (event.trigger_type == "manual" && event.triggered_by_name != null) {
                                append(" · ${event.triggered_by_name}")
                            }
                        }
                        Text(label)
                    },
                    supportingContent = {
                        Text(
                            buildString {
                                append("Requested: ${event.weight_requested_g}g")
                                event.weight_dispensed_g?.let { append(" · Dispensed: ${it}g") }
                            },
                            style = MaterialTheme.typography.bodySmall,
                        )
                    },
                    overlineContent = { Text(time, style = MaterialTheme.typography.labelSmall, color = TextSecondary) },
                    trailingContent = { StatusChip(event.status) },
                )
                HorizontalDivider()
            }

            if (feedHistory.isEmpty()) {
                item {
                    Box(Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No feed history.", color = TextSecondary)
                    }
                }
            }

            // Pagination
            if (totalPages > 1) {
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        OutlinedButton(
                            onClick = { viewModel.loadFeedHistory(petId, feedPage - 1) },
                            enabled = feedPage > 1,
                        ) { Text("Previous") }
                        Text("$feedPage / $totalPages", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                        OutlinedButton(
                            onClick = { viewModel.loadFeedHistory(petId, feedPage + 1) },
                            enabled = feedPage < totalPages,
                        ) { Text("Next") }
                    }
                }
            }
        }
    }
}
