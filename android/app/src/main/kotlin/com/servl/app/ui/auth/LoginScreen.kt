package com.servl.app.ui.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.hilt.navigation.compose.hiltViewModel
import coil3.compose.AsyncImage
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.servl.app.BuildConfig
import com.servl.app.R
import com.servl.app.ui.components.PasswordTextField
import com.servl.app.ui.theme.TextSecondary
import kotlinx.coroutines.launch

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onNavigateToForgotPassword: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel(),
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val error by viewModel.error.collectAsState()
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AsyncImage(
            model = "file:///android_asset/servl-logo.svg",
            contentDescription = "Servl",
            modifier = Modifier.size(160.dp),
        )
        Text(
            "Sign in to your account",
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
            modifier = Modifier.padding(top = 4.dp, bottom = 32.dp),
        )

        OutlinedTextField(
            value = email,
            onValueChange = { email = it; viewModel.clearError() },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentType = ContentType.EmailAddress },
        )

        Spacer(modifier = Modifier.height(12.dp))

        PasswordTextField(
            value = password,
            onValueChange = { password = it; viewModel.clearError() },
            label = "Password",
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentType = ContentType.Password },
        )

        if (error != null) {
            Text(
                text = error!!,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 8.dp),
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = { viewModel.login(email, password, onLoginSuccess) },
            modifier = Modifier.fillMaxWidth(),
            enabled = email.isNotBlank() && password.isNotBlank(),
        ) {
            Text("Sign in")
        }

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedButton(
            onClick = {
                coroutineScope.launch {
                    try {
                        val credentialManager = CredentialManager.create(context)
                        val googleIdOption = GetGoogleIdOption.Builder()
                            .setFilterByAuthorizedAccounts(false)
                            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
                            .build()
                        val request = GetCredentialRequest.Builder()
                            .addCredentialOption(googleIdOption)
                            .build()
                        val result = credentialManager.getCredential(context, request)
                        val credential = result.credential
                        if (credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                            val googleCred = GoogleIdTokenCredential.createFrom(credential.data)
                            viewModel.loginWithGoogle(googleCred.idToken, onLoginSuccess)
                        }
                    } catch (_: GetCredentialCancellationException) {
                        // User dismissed the picker — no error needed
                    } catch (e: Exception) {
                        viewModel.setError("Google Sign-In unavailable: ${e.message}")
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) {
            Image(
                painter = painterResource(R.drawable.ic_google),
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
            Spacer(Modifier.width(8.dp))
            Text("Continue with Google")
        }

        TextButton(onClick = onNavigateToForgotPassword) {
            Text("Forgot password?")
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Don't have an account?", style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = onNavigateToRegister) { Text("Sign up") }
        }
    }
}
