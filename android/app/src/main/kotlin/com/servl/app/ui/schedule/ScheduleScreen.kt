package com.servl.app.ui.schedule

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.servl.app.ui.components.StatusChip
import com.servl.app.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScheduleScreen(
    onNavigateToAdd: () -> Unit,
    onNavigateToEdit: (String) -> Unit,
    viewModel: ScheduleViewModel = hiltViewModel(),
) {
    val schedules by viewModel.schedules.collectAsState()

    Scaffold(
        topBar = { TopAppBar(title = { Text("Schedules") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = onNavigateToAdd) {
                Icon(Icons.Default.Add, "Add schedule")
            }
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(bottom = 80.dp),
        ) {
            if (schedules.isEmpty()) {
                item {
                    Box(Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No schedules yet. Tap + to add one.", color = TextSecondary)
                    }
                }
            }

            items(schedules) { schedule ->
                ListItem(
                    headlineContent = { Text(viewModel.cronToLabel(schedule.cron_expression)) },
                    supportingContent = {
                        Text(
                            buildString {
                                schedule.pet_name?.let { append("$it · ") }
                                append(schedule.feed_type.replaceFirstChar { it.uppercase() })
                                append(" · ${schedule.weight_g}g")
                                schedule.label?.let { append(" · $it") }
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary,
                        )
                    },
                    trailingContent = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Switch(
                                checked = schedule.enabled,
                                onCheckedChange = { viewModel.toggleEnabled(schedule.id, it) },
                            )
                            IconButton(onClick = { onNavigateToEdit(schedule.id) }) {
                                Icon(Icons.Default.Edit, "Edit", modifier = Modifier.size(18.dp))
                            }
                            IconButton(onClick = { viewModel.deleteSchedule(schedule.id) }) {
                                Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
                            }
                        }
                    },
                )
                HorizontalDivider()
            }
        }
    }
}
