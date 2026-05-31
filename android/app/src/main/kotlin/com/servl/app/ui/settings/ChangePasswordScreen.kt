package com.servl.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.servl.app.ui.components.PasswordTextField

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChangePasswordScreen(
    onNavigateBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    var currentPw by remember { mutableStateOf("") }
    var newPw     by remember { mutableStateOf("") }
    var confirmPw by remember { mutableStateOf("") }
    val error   by viewModel.error.collectAsState()
    val success by viewModel.success.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Change password") },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            PasswordTextField(
                value = currentPw,
                onValueChange = { currentPw = it; viewModel.clearMessages() },
                label = "Current password",
                modifier = Modifier.fillMaxWidth(),
            )
            PasswordTextField(
                value = newPw,
                onValueChange = { newPw = it; viewModel.clearMessages() },
                label = "New password",
                modifier = Modifier.fillMaxWidth(),
            )
            PasswordTextField(
                value = confirmPw,
                onValueChange = { confirmPw = it; viewModel.clearMessages() },
                label = "Confirm new password",
                modifier = Modifier.fillMaxWidth(),
            )

            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            success?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall) }

            Button(
                onClick = { viewModel.changePassword(currentPw, newPw) { currentPw = ""; newPw = ""; confirmPw = "" } },
                modifier = Modifier.fillMaxWidth(),
                enabled = currentPw.isNotBlank() && newPw.length >= 8 && newPw == confirmPw,
            ) { Text("Update password") }
        }
    }
}
