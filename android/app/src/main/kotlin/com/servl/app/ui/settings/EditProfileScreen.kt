package com.servl.app.ui.settings

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.servl.app.ui.auth.AuthState
import com.servl.app.ui.auth.AuthViewModel
import com.servl.app.ui.pets.resolvePhotoUrl

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProfileScreen(
    authViewModel: AuthViewModel,
    onNavigateBack: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val authState by authViewModel.authState.collectAsState()
    val user = (authState as? AuthState.Authenticated)?.user
    val error by viewModel.error.collectAsState()

    var name    by remember(user?.name) { mutableStateOf(user?.name ?: "") }
    var photoUri by remember { mutableStateOf<Uri?>(null) }

    val photoPickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { photoUri = it }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit profile") },
                navigationIcon = { IconButton(onClick = onNavigateBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Avatar
            Surface(shape = CircleShape, modifier = Modifier.size(80.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                when {
                    photoUri != null -> AsyncImage(model = photoUri, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(CircleShape))
                    user?.photo_url != null -> AsyncImage(model = resolvePhotoUrl(user.photo_url), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(CircleShape))
                    else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(user?.name?.first()?.uppercase() ?: "", style = MaterialTheme.typography.headlineMedium)
                    }
                }
            }
            OutlinedButton(onClick = { photoPickerLauncher.launch("image/*") }) {
                Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Change photo")
            }

            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Name") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            OutlinedTextField(
                value = user?.email ?: "",
                onValueChange = {},
                label = { Text("Email") },
                enabled = false,
                modifier = Modifier.fillMaxWidth(),
            )

            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            // Save photo separately if selected
            if (photoUri != null) {
                Button(
                    onClick = { viewModel.uploadPhoto(photoUri!!) { authViewModel.refreshCurrentUser() } },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Upload photo") }
            }

            Button(
                onClick = { viewModel.updateProfile(name) { authViewModel.refreshCurrentUser(); onNavigateBack() } },
                modifier = Modifier.fillMaxWidth(),
                enabled = name.isNotBlank(),
            ) { Text("Save changes") }
        }
    }
}
