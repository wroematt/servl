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
import com.servl.app.ui.devices.DeviceViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddEditPetScreen(
    petId: String?,
    onSuccess: () -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: PetViewModel = hiltViewModel(),
    deviceViewModel: DeviceViewModel = hiltViewModel(),
) {
    val isEdit = petId != null
    val selectedPet by viewModel.selectedPet.collectAsState()
    val pets by viewModel.pets.collectAsState()
    val error by viewModel.error.collectAsState()
    val devices by deviceViewModel.devices.collectAsState()

    // Feeders already linked to *other* pets — the backend now rejects
    // double-assigning a device (409 DEVICE_ALREADY_ASSIGNED, see
    // services/pet-service/src/routes/pets.ts), but the picker was still
    // listing them as if they were free, so picking one always failed with a
    // confusing error. Map device_id -> the other pet's name so we can grey
    // those entries out and explain why, instead of hiding them outright
    // (hiding would make an already-assigned device just vanish from the
    // list with no explanation). The pet being edited is excluded so its own
    // current device still shows up as selectable.
    val assignedElsewhere = remember(pets, petId) {
        pets.filter { it.device_id != null && it.id != petId }
            .associate { it.device_id!! to it.name }
    }

    var name            by remember { mutableStateOf("") }
    var type            by remember { mutableStateOf("cat") }
    var mealWeight      by remember { mutableStateOf("80") }
    var snackWeight     by remember { mutableStateOf("40") }
    var dailyTarget     by remember { mutableStateOf("200") }
    var photoUri        by remember { mutableStateOf<Uri?>(null) }
    var selectedDeviceId by remember { mutableStateOf<String?>(null) }
    var deviceMenuExpanded by remember { mutableStateOf(false) }

    // Load the pet being edited, the full pet list (to know which feeders are
    // already taken — see assignedElsewhere above), and the device list.
    LaunchedEffect(petId) {
        if (isEdit) viewModel.loadPet(petId!!)
        viewModel.loadPets()
        deviceViewModel.refreshDevices()
    }

    // Pre-fill fields once the pet data arrives.
    LaunchedEffect(selectedPet) {
        selectedPet?.let { p ->
            if (isEdit && name.isEmpty()) {
                name             = p.name
                type             = p.type
                mealWeight       = p.meal_weight_g.toString()
                snackWeight      = p.snack_weight_g.toString()
                dailyTarget      = p.daily_target_g.toString()
                selectedDeviceId = p.device_id
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

            // Device picker — only shown if at least one device is provisioned.
            if (devices.isNotEmpty()) {
                Text("Feeder device", style = MaterialTheme.typography.labelMedium)
                ExposedDropdownMenuBox(
                    expanded = deviceMenuExpanded,
                    onExpandedChange = { deviceMenuExpanded = !deviceMenuExpanded },
                ) {
                    val selectedLabel = devices.firstOrNull { it.id == selectedDeviceId }?.name ?: "None"
                    OutlinedTextField(
                        value = selectedLabel,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Assign to feeder") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = deviceMenuExpanded) },
                        modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
                    )
                    ExposedDropdownMenu(expanded = deviceMenuExpanded, onDismissRequest = { deviceMenuExpanded = false }) {
                        DropdownMenuItem(
                            text = { Text("None") },
                            onClick = { selectedDeviceId = null; deviceMenuExpanded = false },
                        )
                        devices.forEach { device ->
                            val takenBy = assignedElsewhere[device.id]
                            DropdownMenuItem(
                                text = {
                                    Column {
                                        Text(device.name)
                                        if (takenBy != null) {
                                            Text(
                                                "Already assigned to $takenBy",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }
                                },
                                enabled = takenBy == null,
                                onClick = { selectedDeviceId = device.id; deviceMenuExpanded = false },
                            )
                        }
                    }
                }
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            Button(
                onClick = {
                    val meal    = mealWeight.toIntOrNull() ?: return@Button
                    val snack   = snackWeight.toIntOrNull() ?: return@Button
                    val target  = dailyTarget.toIntOrNull() ?: return@Button
                    if (isEdit) {
                        viewModel.updatePet(petId!!, name, type, meal, snack, target, photoUri, selectedDeviceId, onSuccess)
                    } else {
                        viewModel.createPet(name, type, meal, snack, target, photoUri, selectedDeviceId, onSuccess)
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
