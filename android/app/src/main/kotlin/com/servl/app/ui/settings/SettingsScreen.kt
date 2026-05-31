package com.servl.app.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.servl.app.BuildConfig
import com.servl.app.ui.auth.AuthState
import com.servl.app.ui.auth.AuthViewModel
import com.servl.app.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    authViewModel: AuthViewModel,
    onNavigateToProfile: () -> Unit,
    onNavigateToPassword: () -> Unit,
    onNavigateToHousehold: () -> Unit,
    onLogout: () -> Unit,
) {
    val authState by authViewModel.authState.collectAsState()
    val user = (authState as? AuthState.Authenticated)?.user
    var showLogoutDialog by remember { mutableStateOf(false) }

    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Sign out?") },
            confirmButton = {
                TextButton(onClick = { authViewModel.logout(onLogout) }) { Text("Sign out") }
            },
            dismissButton = { TextButton(onClick = { showLogoutDialog = false }) { Text("Cancel") } },
        )
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Settings") }) }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding)) {

            // User header card
            user?.let { u ->
                item {
                    ListItem(
                        headlineContent = { Text(u.name) },
                        supportingContent = { Text(u.email) },
                        leadingContent = {
                            Surface(shape = MaterialTheme.shapes.medium, modifier = Modifier.size(40.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Text(u.name.first().uppercase(), style = MaterialTheme.typography.titleMedium)
                                }
                            }
                        },
                    )
                    HorizontalDivider()
                }
            }

            item {
                ListItem(
                    headlineContent = { Text("Edit profile") },
                    leadingContent  = { Icon(Icons.Default.Person, null) },
                    trailingContent = { Icon(Icons.AutoMirrored.Filled.ArrowForward, null) },
                    modifier = Modifier.clickable(onClick = onNavigateToProfile),
                )
                HorizontalDivider()
            }

            item {
                ListItem(
                    headlineContent = { Text("Change password") },
                    leadingContent  = { Icon(Icons.Default.Lock, null) },
                    trailingContent = { Icon(Icons.AutoMirrored.Filled.ArrowForward, null) },
                    modifier = Modifier.clickable(onClick = onNavigateToPassword),
                )
                HorizontalDivider()
            }

            item {
                ListItem(
                    headlineContent = { Text("Household") },
                    leadingContent  = { Icon(Icons.Default.Group, null) },
                    trailingContent = { Icon(Icons.AutoMirrored.Filled.ArrowForward, null) },
                    modifier = Modifier.clickable(onClick = onNavigateToHousehold),
                )
                HorizontalDivider()
            }

            item { Spacer(Modifier.height(24.dp)) }

            item {
                ListItem(
                    headlineContent = { Text("App version") },
                    supportingContent = { Text("v${BuildConfig.VERSION_NAME}", color = TextSecondary) },
                    leadingContent = { Icon(Icons.Default.Info, null, tint = TextSecondary) },
                )
                HorizontalDivider()
            }

            item {
                ListItem(
                    headlineContent = { Text("Sign out", color = MaterialTheme.colorScheme.error) },
                    leadingContent  = { Icon(Icons.AutoMirrored.Filled.Logout, null, tint = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable { showLogoutDialog = true },
                )
            }
        }
    }
}
