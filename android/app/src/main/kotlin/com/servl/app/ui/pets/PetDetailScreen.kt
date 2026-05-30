package com.servl.app.ui.pets

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
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
import coil3.compose.AsyncImage
import com.servl.app.ui.components.StatusChip
import com.servl.app.ui.components.feedTypeIcon
import com.servl.app.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PetDetailScreen(
    petId: String,
    onNavigateBack: () -> Unit,
    onNavigateToEdit: () -> Unit,
    onNavigateToStats: () -> Unit,
    onNavigateToHistory: () -> Unit,
    onDeleted: () -> Unit,
    viewModel: PetViewModel = hiltViewModel(),
) {
    val pet by viewModel.selectedPet.collectAsState()
    val error by viewModel.error.collectAsState()
    var showDeleteDialog by remember { mutableStateOf(false) }

    LaunchedEffect(petId) {
        viewModel.loadPet(petId)
        viewModel.loadFeedHistory(petId)
    }

    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete ${pet?.name}?") },
            text = { Text("This will remove the pet. Feed history will be preserved.") },
            confirmButton = {
                TextButton(onClick = { viewModel.deletePet(petId, onDeleted) }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { showDeleteDialog = false }) { Text("Cancel") } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(pet?.name ?: "") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToEdit) { Icon(Icons.Default.Edit, "Edit") }
                    IconButton(onClick = { showDeleteDialog = true }) { Icon(Icons.Default.Delete, "Delete", tint = MaterialTheme.colorScheme.error) }
                },
            )
        },
    ) { padding ->
        if (pet == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }

        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                // Header card
                Card {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Surface(shape = MaterialTheme.shapes.medium, modifier = Modifier.size(72.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                            if (pet!!.photo_url != null) {
                                AsyncImage(model = resolvePhotoUrl(pet!!.photo_url), contentDescription = pet!!.name, modifier = Modifier.fillMaxSize())
                            } else {
                                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Text(pet!!.name.first().uppercase(), style = MaterialTheme.typography.headlineMedium)
                                }
                            }
                        }
                        Spacer(Modifier.width(16.dp))
                        Column {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(pet!!.name, style = MaterialTheme.typography.titleLarge)
                                StatusChip(pet!!.type)
                            }
                            if (pet!!.device_name != null) {
                                Text("Device: ${pet!!.device_name}", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                            }
                            Text("Today: ${pet!!.today_intake_g}g / ${pet!!.daily_target_g}g", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                        }
                    }
                }
            }

            // Quick feed buttons
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = { viewModel.feedMeal(petId) }, modifier = Modifier.weight(1f)) {
                        Icon(feedTypeIcon("meal"), contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Meal · ${pet!!.meal_weight_g}g")
                    }
                    OutlinedButton(onClick = { viewModel.feedSnack(petId) }, modifier = Modifier.weight(1f)) {
                        Icon(feedTypeIcon("snack"), contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Snack · ${pet!!.snack_weight_g}g")
                    }
                }
            }

            // Nav buttons
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = onNavigateToStats, modifier = Modifier.weight(1f)) { Text("Statistics") }
                    OutlinedButton(onClick = onNavigateToHistory, modifier = Modifier.weight(1f)) { Text("Feed history") }
                }
            }

            error?.let {
                item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}
