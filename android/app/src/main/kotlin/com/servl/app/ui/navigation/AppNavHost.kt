package com.servl.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.servl.app.ui.auth.*

@Composable
fun AppNavHost(authViewModel: AuthViewModel = hiltViewModel()) {
    val authState by authViewModel.authState.collectAsState()
    val navController = rememberNavController()

    // NavHost requires a fixed startDestination — changing it after composition is not supported
    // and causes the wrong tab to be shown.  Always start at Login; navigate to Home via
    // LaunchedEffect once the auth check resolves to Authenticated.
    LaunchedEffect(authState) {
        if (authState is AuthState.Authenticated) {
            navController.navigate(Screen.Home.route) {
                popUpTo(Screen.Login.route) { inclusive = true }
            }
        }
    }

    NavHost(navController = navController, startDestination = Screen.Login.route) {

        // ── Auth screens (no bottom nav) ──────────────────────────────────────

        composable(Screen.Login.route) {
            LoginScreen(
                // Navigation is handled by LaunchedEffect above (authState → Authenticated).
                // This callback is intentionally a no-op to avoid a duplicate navigate call.
                onLoginSuccess = {},
                onNavigateToRegister = { navController.navigate(Screen.Register.route) },
                onNavigateToForgotPassword = { navController.navigate(Screen.ForgotPassword.route) },
                viewModel = authViewModel,
            )
        }

        composable(Screen.Register.route) {
            RegisterScreen(
                // Same as above — LaunchedEffect drives the transition to Home.
                onRegisterSuccess = {},
                onNavigateToLogin = { navController.popBackStack() },
                viewModel = authViewModel,
            )
        }

        composable(Screen.ForgotPassword.route) {
            ForgotPasswordScreen(onNavigateBack = { navController.popBackStack() })
        }

        composable("reset-password?token={token}") { backStackEntry ->
            val token = backStackEntry.arguments?.getString("token") ?: ""
            ResetPasswordScreen(
                token = token,
                onSuccess = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }

        // ── Main app (with bottom nav scaffold) ───────────────────────────────

        composable(Screen.Home.route) {
            MainNavHost(
                authViewModel = authViewModel,
                onLogout = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
    }
}
