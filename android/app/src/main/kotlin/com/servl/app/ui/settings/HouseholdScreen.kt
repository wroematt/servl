package com.servl.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import android.content.ClipData
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import kotlinx.coroutines.launch
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.servl.app.ui.auth.AuthState
import com.servl.app.ui.auth.AuthViewModel
import com.servl.app.ui.components.StatusChip
import com.servl.app.ui.theme.TextSecondary
import java.util.TimeZone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HouseholdScreen(
    authViewModel: AuthViewModel,
    onNavigateBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val authState by authViewModel.authState.collectAsState()
    val user = (authState as? AuthState.Authenticated)?.user
    val isOwner = user?.role == "owner"
    val members by viewModel.members.collectAsState()
    val timezone by viewModel.timezone.collectAsState()
    val inviteUrl by viewModel.inviteUrl.collectAsState()
    val error by viewModel.error.collectAsState()
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var copiedInvite by remember { mutableStateOf(false) }
    var memberToRemove by remember { mutableStateOf<com.servl.app.data.network.dto.HouseholdMemberDto?>(null) }

    // Timezone dialog state
    var showTimezoneDialog by remember { mutableStateOf(false) }
    var tzSearch by remember { mutableStateOf("") }
    var tzDropdownExpanded by remember { mutableStateOf(false) }

    // Full list computed once — filtered to "Continent/City" format, sorted
    val allTimezones: List<String> = remember {
        TimeZone.getAvailableIDs()
            .filter { id ->
                id.contains('/') &&
                !id.startsWith("Etc/") &&
                !id.startsWith("SystemV/") &&
                !id.startsWith("US/")
            }
            .sorted()
    }

    // Filtered results: if search is blank show phone TZ first then first 19 alphabetically;
    // otherwise show up to 20 case-insensitive matches.
    val filteredTimezones: List<String> = remember(tzSearch) {
        if (tzSearch.isBlank()) {
            val phone = TimeZone.getDefault().id
            listOf(phone) + allTimezones.filter { it != phone }.take(19)
        } else {
            allTimezones.filter { it.contains(tzSearch, ignoreCase = true) }.take(20)
        }
    }

    LaunchedEffect(Unit) {
        viewModel.loadMembers()
        viewModel.loadTimezone()
    }

    // Auto-correct: if household is still on the 'UTC' default and the user is an owner,
    // silently update to the phone's local timezone.
    LaunchedEffect(timezone) {
        if (timezone == "UTC" && isOwner) {
            val phone = TimeZone.getDefault().id
            if (phone != "UTC") viewModel.updateTimezone(phone)
        }
    }

    // ── Timezone dialog ─────────────────────────────────────────────────────────
    if (showTimezoneDialog) {
        AlertDialog(
            onDismissRequest = { showTimezoneDialog = false },
            title = { Text("Household timezone") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Schedules fire at the time shown in this timezone.",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                    )
                    ExposedDropdownMenuBox(
                        expanded = tzDropdownExpanded,
                        onExpandedChange = { tzDropdownExpanded = it },
                    ) {
                        OutlinedTextField(
                            value = tzSearch,
                            onValueChange = { tzSearch = it; tzDropdownExpanded = true },
                            label = { Text("Search timezone") },
                            singleLine = true,
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = tzDropdownExpanded) },
                            modifier = Modifier
                                .menuAnchor(MenuAnchorType.PrimaryEditable)
                                .fillMaxWidth(),
                        )
                        ExposedDropdownMenu(
                            expanded = tzDropdownExpanded && filteredTimezones.isNotEmpty(),
                            onDismissRequest = { tzDropdownExpanded = false },
                        ) {
                            filteredTimezones.forEach { tz ->
                                DropdownMenuItem(
                                    text = { Text(tz, style = MaterialTheme.typography.bodyMedium) },
                                    onClick = { tzSearch = tz; tzDropdownExpanded = false },
                                    contentPadding = ExposedDropdownMenuDefaults.ItemContentPadding,
                                )
                            }
                        }
                    }
                    TextButton(
                        onClick = {
                            tzSearch = TimeZone.getDefault().id
                            tzDropdownExpanded = false
                        },
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Text(
                            "Use phone timezone (${TimeZone.getDefault().id})",
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.updateTimezone(tzSearch); showTimezoneDialog = false },
                    enabled = tzSearch.isNotBlank(),
                ) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { showTimezoneDialog = false }) { Text("Cancel") } },
        )
    }

    // ── Remove member dialog ────────────────────────────────────────────────────
    memberToRemove?.let { m ->
        AlertDialog(
            onDismissRequest = { memberToRemove = null },
            title = { Text("Remove ${m.name}?") },
            confirmButton = {
                TextButton(onClick = { viewModel.removeMember(m.id); memberToRemove = null }) {
                    Text("Remove", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { memberToRemove = null }) { Text("Cancel") } },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Household") },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
                actions = {
                    if (isOwner) {
                        TextButton(onClick = { viewModel.generateInvite() }) { Text("Invite") }
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {

            // ── Timezone row ──────────────────────────────────────────────
            item {
                ListItem(
                    headlineContent = { Text("Schedule timezone") },
                    supportingContent = {
                        when (timezone) {
                            null -> Text("Loading…", color = TextSecondary)
                            ""   -> Text("Not available", color = TextSecondary)
                            else -> Text(timezone!!, color = TextSecondary)
                        }
                    },
                    leadingContent  = { Icon(Icons.Default.Schedule, contentDescription = null) },
                    trailingContent = if (isOwner) ({
                        IconButton(onClick = {
                            tzSearch = timezone?.takeIf { it.isNotEmpty() } ?: TimeZone.getDefault().id
                            tzDropdownExpanded = false
                            showTimezoneDialog = true
                        }) {
                            Icon(Icons.Default.Edit, contentDescription = "Edit timezone")
                        }
                    }) else null,
                )
                HorizontalDivider()
            }

            // ── Invite URL card ───────────────────────────────────────────
            inviteUrl?.let { url ->
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(url, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f), maxLines = 2)
                            TextButton(onClick = {
                                scope.launch {
                                    clipboard.setClipEntry(ClipEntry(ClipData.newPlainText("invite_url", url)))
                                }
                                copiedInvite = true
                            }) { Text(if (copiedInvite) "Copied!" else "Copy") }
                        }
                    }
                }
            }

            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }

            // ── Members list ──────────────────────────────────────────────
            items(members) { member ->
                val isSelf = member.id == user?.id
                val canManage = isOwner && !isSelf
                ListItem(
                    headlineContent = {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(member.name)
                            if (isSelf) Text("(you)", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
                        }
                    },
                    supportingContent = { Text(member.email, style = MaterialTheme.typography.bodySmall, color = TextSecondary) },
                    trailingContent = {
                        if (canManage) {
                            Column(horizontalAlignment = Alignment.End) {
                                StatusChip(member.role)
                                Row {
                                    if (member.role == "member") {
                                        TextButton(onClick = { viewModel.updateRole(member.id, "owner") }, contentPadding = PaddingValues(4.dp)) {
                                            Text("Make owner", style = MaterialTheme.typography.labelSmall)
                                        }
                                    } else {
                                        TextButton(onClick = { viewModel.updateRole(member.id, "member") }, contentPadding = PaddingValues(4.dp)) {
                                            Text("Make member", style = MaterialTheme.typography.labelSmall)
                                        }
                                    }
                                    TextButton(onClick = { memberToRemove = member }, contentPadding = PaddingValues(4.dp)) {
                                        Text("Remove", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        } else {
                            StatusChip(member.role)
                        }
                    },
                )
                HorizontalDivider()
            }
        }
    }
}
