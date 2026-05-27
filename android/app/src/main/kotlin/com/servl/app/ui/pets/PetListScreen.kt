package com.servl.app.ui.pets

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.servl.app.ui.components.StatusChip
import com.servl.app.ui.theme.TextSecondary
import com.servl.app.BuildConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PetListScreen(
    onNavigateToPetDetail: (String) -> Unit,
    onNavigateToAddPet: () -> Unit,
    viewModel: PetViewModel = hiltViewModel(),
) {
    val pets by viewModel.pets.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadPets() }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Pets") }) },
        floatingActionButton = {
            FloatingActionButton(onClick = onNavigateToAddPet) {
                Icon(Icons.Default.Add, contentDescription = "Add pet")
            }
        },
    ) { padding ->
        if (isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }

        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (pets.isEmpty()) {
                item {
                    Box(Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No pets yet. Tap + to add one.", color = TextSecondary)
                    }
                }
            }
            items(pets) { pet ->
                Card(modifier = Modifier.fillMaxWidth().clickable { onNavigateToPetDetail(pet.id) }) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        // Pet avatar
                        Surface(
                            shape = MaterialTheme.shapes.medium,
                            modifier = Modifier.size(56.dp),
                            color = MaterialTheme.colorScheme.primaryContainer,
                        ) {
                            if (pet.photo_url != null) {
                                AsyncImage(
                                    model = resolvePhotoUrl(pet.photo_url),
                                    contentDescription = pet.name,
                                    modifier = Modifier.fillMaxSize(),
                                )
                            } else {
                                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Text(pet.name.first().uppercase(), style = MaterialTheme.typography.titleLarge)
                                }
                            }
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(pet.name, style = MaterialTheme.typography.titleMedium)
                                StatusChip(pet.type)
                            }
                            Text(
                                "${pet.today_intake_g}g / ${pet.daily_target_g}g today",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary,
                            )
                            LinearProgressIndicator(
                                progress = { (pet.today_intake_g.toFloat() / pet.daily_target_g.coerceAtLeast(1)).coerceIn(0f, 1f) },
                                modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

fun resolvePhotoUrl(path: String?): String? {
    if (path == null) return null
    return if (path.startsWith("http")) path else "${BuildConfig.BASE_URL}$path"
}
