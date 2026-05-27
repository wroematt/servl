package com.servl.app.ui.pets

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddEditPetScreen(
    petId: String?,
    onSuccess: () -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: PetViewModel = hiltViewModel(),
) {
    val isEdit = petId != null
    val selectedPet by viewModel.selectedPet.collectAsState()
    val error by viewModel.error.collectAsState()

    var name        by remember { mutableStateOf("") }
    var type        by remember { mutableStateOf("cat") }
    var mealWeight  by remember { mutableStateOf("80") }
    var snackWeight by remember { mutableStateOf("40") }
    var dailyTarget by remember { mutableStateOf("200") }
    var photoUri    by remember { mutableStateOf<Uri?>(null) }

    LaunchedEffect(petId) {
        if (isEdit) {
            viewModel.loadPet(petId!!)
        }
    }

    LaunchedEffect(selectedPet) {
        selectedPet?.let { p ->
            if (isEdit && name.isEmpty()) {
                name        = p.name
                type        = p.type
                mealWeight  = p.meal_weight_g.toString()
                snackWeight = p.snack_weight_g.toString()
                dailyTarget = p.daily_target_g.toString()
            }
        }
    }

    val photoPickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { photoUri = it }
    }

    val typeOptions = listOf("cat", "dog", "other")

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isEdit) "Edit pet" else "Add pet") },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Photo picker
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Surface(shape = MaterialTheme.shapes.medium, modifier = Modifier.size(80.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                    when {
                        photoUri != null -> AsyncImage(model = photoUri, contentDescription = null, modifier = Modifier.fillMaxSize())
                        isEdit && selectedPet?.photo_url != null -> AsyncImage(
                            model = resolvePhotoUrl(selectedPet!!.photo_url),
                            contentDescription = null,
                            modifier = Modifier.fillMaxSize(),
                        )
                        else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.CameraAlt, contentDescription = null)
                        }
                    }
                }
                OutlinedButton(onClick = { photoPickerLauncher.launch("image/*") }) {
                    Text(if (photoUri != null) "Change photo" else "Add photo")
                }
            }

            OutlinedTextField(value = name, onValueChange = { name = it; viewModel.clearError() }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)

            // Type selector
            Text("Type", style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                typeOptions.forEach { option ->
                    FilterChip(
                        selected = type == option,
                        onClick = { type = option },
                        label = { Text(option.replaceFirstChar { it.uppercase() }) },
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = mealWeight,
                    onValueChange = { mealWeight = it },
                    label = { Text("Meal (g)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = snackWeight,
                    onValueChange = { snackWeight = it },
                    label = { Text("Snack (g)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = dailyTarget,
                    onValueChange = { dailyTarget = it },
                    label = { Text("Target (g)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            Button(
                onClick = {
                    val meal    = mealWeight.toIntOrNull() ?: return@Button
                    val snack   = snackWeight.toIntOrNull() ?: return@Button
                    val target  = dailyTarget.toIntOrNull() ?: return@Button
                    if (isEdit) {
                        viewModel.updatePet(petId!!, name, type, meal, snack, target, photoUri, onSuccess)
                    } else {
                        viewModel.createPet(name, type, meal, snack, target, photoUri, onSuccess)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = name.isNotBlank(),
            ) {
                Text(if (isEdit) "Save changes" else "Add pet")
            }
        }
    }
}
