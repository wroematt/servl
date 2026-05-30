package com.servl.app.ui.schedule

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.servl.app.ui.components.feedTypeIcon
import com.servl.app.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddEditScheduleScreen(
    scheduleId: String?,
    onSuccess: () -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: ScheduleViewModel = hiltViewModel(),
) {
    val pets by viewModel.pets.collectAsState()
    val schedules by viewModel.schedules.collectAsState()
    val error by viewModel.error.collectAsState()
    val isEdit = scheduleId != null
    val existing = schedules.find { it.id == scheduleId }

    var selectedPetId by remember { mutableStateOf("") }
    var label        by remember { mutableStateOf("") }
    var feedType     by remember { mutableStateOf("meal") }
    var weightG      by remember { mutableStateOf("80") }
    var hour         by remember { mutableStateOf("08") }
    var minute       by remember { mutableStateOf("00") }
    var selectedDays by remember { mutableStateOf(setOf<Int>()) } // empty = daily (*)

    LaunchedEffect(existing) {
        existing?.let { s ->
            selectedPetId = s.pet_id
            label         = s.label ?: ""
            feedType      = s.feed_type
            weightG       = s.weight_g.toString()
            val parts = s.cron_expression.split(" ")
            if (parts.size >= 2) { minute = parts[0]; hour = parts[1] }
            if (parts.size >= 5 && parts[4] != "*") {
                selectedDays = parts[4].split(",").mapNotNull { it.toIntOrNull() }.toSet()
            }
        }
    }

    // Helper: resolve weight for a given feed type and pet
    fun weightForType(type: String, petId: String): String {
        val pet = pets.find { it.id == petId } ?: return weightG
        return when (type) {
            "meal"  -> pet.meal_weight_g.toString()
            "snack" -> pet.snack_weight_g.toString()
            else    -> weightG
        }
    }

    LaunchedEffect(pets) {
        if (selectedPetId.isEmpty() && pets.isNotEmpty()) {
            selectedPetId = pets.first().id
            // Only initialise weight on create; edit flow already populated from existing schedule
            if (!isEdit) weightG = weightForType(feedType, pets.first().id)
        }
    }

    val feedTypes = listOf("meal", "snack", "custom")
    val days = listOf(0 to "Sun", 1 to "Mon", 2 to "Tue", 3 to "Wed", 4 to "Thu", 5 to "Fri", 6 to "Sat")

    fun buildCron(): String {
        val dow = if (selectedDays.isEmpty()) "*" else selectedDays.sorted().joinToString(",")
        return "${minute.padStart(2, '0')} ${hour.padStart(2, '0')} * * $dow"
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isEdit) "Edit schedule" else "Add schedule") },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Pet picker
            if (pets.isNotEmpty()) {
                var expanded by remember { mutableStateOf(false) }
                val selectedPetName = pets.find { it.id == selectedPetId }?.name ?: "Select pet"
                ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                    OutlinedTextField(
                        value = selectedPetName,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Pet") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                        modifier = Modifier.menuAnchor().fillMaxWidth(),
                    )
                    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        pets.forEach { pet ->
                            DropdownMenuItem(
                                text = { Text(pet.name) },
                                onClick = {
                                    selectedPetId = pet.id
                                    expanded = false
                                    if (feedType != "custom") weightG = weightForType(feedType, pet.id)
                                },
                            )
                        }
                    }
                }
            }

            OutlinedTextField(value = label, onValueChange = { label = it }, label = { Text("Label (optional)") }, modifier = Modifier.fillMaxWidth(), singleLine = true)

            // Feed type
            Text("Feed type", style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                feedTypes.forEach { t ->
                    FilterChip(
                        selected = feedType == t,
                        onClick = {
                            feedType = t
                            if (t != "custom") weightG = weightForType(t, selectedPetId)
                        },
                        label = { Text(t.replaceFirstChar { it.uppercase() }) },
                        leadingIcon = {
                            Icon(
                                imageVector = feedTypeIcon(t),
                                contentDescription = null,
                                modifier = Modifier.size(FilterChipDefaults.IconSize),
                            )
                        },
                    )
                }
            }

            when (feedType) {
                "custom" -> OutlinedTextField(
                    value = weightG,
                    onValueChange = { weightG = it },
                    label = { Text("Weight (g)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                else -> {
                    // Show the pet-specific weight as read-only info
                    val pet = pets.find { it.id == selectedPetId }
                    if (pet != null) {
                        Text(
                            "Weight: ${weightG}g (from ${pet.name}'s settings)",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary,
                        )
                    }
                }
            }

            // Time picker
            Text("Time", style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = hour,
                    onValueChange = { if (it.length <= 2) hour = it },
                    label = { Text("Hour") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
                Text(":", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(
                    value = minute,
                    onValueChange = { if (it.length <= 2) minute = it },
                    label = { Text("Minute") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                )
            }

            // Days of week
            Text("Days (leave empty for daily)", style = MaterialTheme.typography.labelMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
                days.forEach { (num, name) ->
                    FilterChip(
                        selected = num in selectedDays,
                        onClick = {
                            selectedDays = if (num in selectedDays) selectedDays - num else selectedDays + num
                        },
                        label = { Text(name, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            Button(
                onClick = {
                    val cron = buildCron()
                    val w = weightG.toIntOrNull() ?: 80
                    if (isEdit) {
                        viewModel.updateSchedule(scheduleId!!, selectedPetId, label.ifBlank { null }, feedType, w, cron, onSuccess)
                    } else {
                        viewModel.createSchedule(selectedPetId, label.ifBlank { null }, feedType, w, cron, onSuccess)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = selectedPetId.isNotBlank(),
            ) { Text(if (isEdit) "Save changes" else "Add schedule") }
        }
    }
}
