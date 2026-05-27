package com.servl.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.servl.app.ui.auth.AuthState
import com.servl.app.ui.auth.AuthViewModel
import com.servl.app.ui.components.StatusChip
import com.servl.app.ui.theme.TextSecondary

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
    val inviteUrl by viewModel.inviteUrl.collectAsState()
    val error by viewModel.error.collectAsState()
    val clipboard = LocalClipboardManager.current
    var copiedInvite by remember { mutableStateOf(false) }
    var memberToRemove by remember { mutableStateOf<com.servl.app.data.network.dto.HouseholdMemberDto?>(null) }

    LaunchedEffect(Unit) { viewModel.loadMembers() }

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
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {

            // Invite URL card
            inviteUrl?.let { url ->
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(url, style = MaterialTheme.typography.labelSmall, modifier = Modifier.weight(1f), maxLines = 2)
                            TextButton(onClick = {
                                clipboard.setText(AnnotatedString(url))
                                copiedInvite = true
                            }) { Text(if (copiedInvite) "Copied!" else "Copy") }
                        }
                    }
                }
            }

            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }

            // Members list
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
