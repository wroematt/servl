package com.servl.app.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Pets
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.servl.app.ui.auth.AuthViewModel
import com.servl.app.ui.devices.DeviceDetailScreen
import com.servl.app.ui.devices.DeviceListScreen
import com.servl.app.ui.home.HomeScreen
import com.servl.app.ui.pets.*
import com.servl.app.ui.provision.ProvisionScreen
import com.servl.app.ui.schedule.AddEditScheduleScreen
import com.servl.app.ui.schedule.ScheduleScreen
import com.servl.app.ui.settings.*

data class BottomNavItem(
    val screen: Screen,
    val label: String,
    val icon: ImageVector,
)

val bottomNavItems = listOf(
    BottomNavItem(Screen.Home,     "Home",     Icons.Default.Home),
    BottomNavItem(Screen.Pets,     "Pets",     Icons.Default.Pets),
    BottomNavItem(Screen.Schedule, "Schedule", Icons.Default.CalendarMonth),
    BottomNavItem(Screen.Devices,  "Devices",  Icons.Default.Router),
)

@Composable
fun MainNavHost(
    authViewModel: AuthViewModel,
    onLogout: () -> Unit,
) {
    val navController = rememberNavController()
    val currentBackStack by navController.currentBackStackEntryAsState()
    val currentDestination = currentBackStack?.destination

    // Show bottom bar only for the 4 top-level tabs
    val topLevelRoutes = bottomNavItems.map { it.screen.route }.toSet()
    val showBottomBar = currentDestination?.route in topLevelRoutes

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomNavItems.forEach { item ->
                        val selected = currentDestination?.hierarchy
                            ?.any { it.route == item.screen.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(item.screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = { Text(item.label) },
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Home.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Screen.Home.route) {
                HomeScreen(
                    authViewModel = authViewModel,
                    onNavigateToPetDetail = { petId -> navController.navigate(Screen.PetDetail.go(petId)) },
                    onNavigateToDevices = { navController.navigate(Screen.Devices.route) },
                    onNavigateToSettings = { navController.navigate(Screen.Settings.route) },
                )
            }
            composable(Screen.Pets.route) {
                PetListScreen(
                    onNavigateToPetDetail = { petId -> navController.navigate(Screen.PetDetail.go(petId)) },
                    onNavigateToAddPet = { navController.navigate(Screen.AddPet.route) },
                )
            }
            composable(Screen.PetDetail.route) { backStackEntry ->
                val petId = backStackEntry.arguments?.getString("petId") ?: return@composable
                PetDetailScreen(
                    petId = petId,
                    onNavigateBack = { navController.popBackStack() },
                    onNavigateToEdit = { navController.navigate(Screen.EditPet.go(petId)) },
                    onNavigateToStats = { navController.navigate(Screen.PetStats.go(petId)) },
                    onNavigateToHistory = { navController.navigate(Screen.FeedHistory.go(petId)) },
                    onDeleted = { navController.popBackStack() },
                )
            }
            composable(Screen.AddPet.route) {
                AddEditPetScreen(
                    petId = null,
                    onSuccess = { navController.popBackStack() },
                    onNavigateBack = { navController.popBackStack() },
                )
            }
            composable(Screen.EditPet.route) { backStackEntry ->
                val petId = backStackEntry.arguments?.getString("petId") ?: return@composable
                AddEditPetScreen(
                    petId = petId,
                    onSuccess = { navController.popBackStack() },
                    onNavigateBack = { navController.popBackStack() },
                )
            }
            composable(Screen.PetStats.route) { backStackEntry ->
                val petId = backStackEntry.arguments?.getString("petId") ?: return@composable
                PetStatsScreen(petId = petId, onNavigateBack = { navController.popBackStack() })
            }
            composable(Screen.FeedHistory.route) { backStackEntry ->
                val petId = backStackEntry.arguments?.getString("petId") ?: return@composable
                FeedHistoryScreen(petId = petId, onNavigateBack = { navController.popBackStack() })
            }
            composable(Screen.Schedule.route) {
                ScheduleScreen(
                    onNavigateToAdd = { navController.navigate(Screen.AddSchedule.route) },
                    onNavigateToEdit = { id -> navController.navigate(Screen.EditSchedule.go(id)) },
                )
            }
            composable(Screen.AddSchedule.route) {
                AddEditScheduleScreen(
                    scheduleId = null,
                    onSuccess = { navController.popBackStack() },
                    onNavigateBack = { navController.popBackStack() },
                )
            }
            composable(Screen.EditSchedule.route) { backStackEntry ->
                val scheduleId = backStackEntry.arguments?.getString("scheduleId") ?: return@composable
                AddEditScheduleScreen(
                    scheduleId = scheduleId,
                    onSuccess = { navController.popBackStack() },
                    onNavigateBack = { navController.popBackStack() },
                )
            }
            composable(Screen.Devices.route) {
                DeviceListScreen(
                    authViewModel = authViewModel,
                    onNavigateToDetail = { id -> navController.navigate(Screen.DeviceDetail.go(id)) },
                    onNavigateToProvision = { navController.navigate(Screen.Provision.route) },
                )
            }
            composable(Screen.DeviceDetail.route) { backStackEntry ->
                val deviceId = backStackEntry.arguments?.getString("deviceId") ?: return@composable
                DeviceDetailScreen(
                    deviceId = deviceId,
                    authViewModel = authViewModel,
                    onNavigateBack = { navController.popBackStack() },
                )
            }
            composable(Screen.Provision.route) {
                ProvisionScreen(onSuccess = { navController.popBackStack() }, onCancel = { navController.popBackStack() })
            }
            composable(Screen.Settings.route) {
                SettingsScreen(
                    authViewModel = authViewModel,
                    onNavigateToProfile = { navController.navigate(Screen.EditProfile.route) },
                    onNavigateToPassword = { navController.navigate(Screen.ChangePassword.route) },
                    onNavigateToHousehold = { navController.navigate(Screen.Household.route) },
                    onLogout = onLogout,
                )
            }
            composable(Screen.EditProfile.route) {
                EditProfileScreen(
                    authViewModel = authViewModel,
                    onNavigateBack = { navController.popBackStack() },
                )
            }
            composable(Screen.ChangePassword.route) {
                ChangePasswordScreen(onNavigateBack = { navController.popBackStack() })
            }
            composable(Screen.Household.route) {
                HouseholdScreen(
                    authViewModel = authViewModel,
                    onNavigateBack = { navController.popBackStack() },
                )
            }
        }
    }
}
