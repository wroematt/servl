package com.servl.app.ui.navigation

sealed class Screen(val route: String) {
    // Auth graph
    object Login          : Screen("login")
    object Register       : Screen("register")
    object ForgotPassword : Screen("forgot-password")
    object ResetPassword  : Screen("reset-password?token={token}") {
        fun go(token: String) = "reset-password?token=$token"
    }
    object JoinHousehold  : Screen("join?token={token}") {
        fun go(token: String) = "join?token=$token"
    }

    // Main bottom nav tabs
    object Home     : Screen("home")
    object Pets     : Screen("pets")
    object Schedule : Screen("schedule")
    object Devices  : Screen("devices")

    // Nested routes in main graph
    object PetDetail : Screen("pets/{petId}") {
        fun go(petId: String) = "pets/$petId"
    }
    object AddPet : Screen("pets/add")
    object EditPet : Screen("pets/edit/{petId}") {
        fun go(petId: String) = "pets/edit/$petId"
    }
    object PetStats : Screen("pets/{petId}/stats") {
        fun go(petId: String) = "pets/$petId/stats"
    }
    object FeedHistory : Screen("pets/{petId}/history") {
        fun go(petId: String) = "pets/$petId/history"
    }
    object AddSchedule  : Screen("schedule/add")
    object EditSchedule : Screen("schedule/edit/{scheduleId}") {
        fun go(scheduleId: String) = "schedule/edit/$scheduleId"
    }
    object DeviceDetail : Screen("devices/{deviceId}") {
        fun go(deviceId: String) = "devices/$deviceId"
    }
    object Provision : Screen("provision")

    // Settings (accessible from top bar)
    object Settings        : Screen("settings")
    object EditProfile     : Screen("settings/profile")
    object ChangePassword  : Screen("settings/password")
    object Household       : Screen("settings/household")
}
