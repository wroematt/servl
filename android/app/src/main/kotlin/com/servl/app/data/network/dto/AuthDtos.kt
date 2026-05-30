package com.servl.app.data.network.dto

data class LoginRequest(val email: String, val password: String)
data class RegisterRequest(val name: String, val email: String, val password: String)
data class RefreshRequest(val refreshToken: String)
data class ForgotPasswordRequest(val email: String)
data class ResetPasswordRequest(val token: String, val password: String)
data class JoinHouseholdRequest(val token: String)

data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val user: UserDto?,   // nullable — older backend builds omit this field
)

data class RefreshResponse(
    val accessToken: String,
    val refreshToken: String,
)
