package com.servl.app.data.network.dto

data class UserDto(
    val id: String,
    val household_id: String?,
    val email: String,
    val name: String,
    val photo_url: String?,
    val role: String,       // "owner" | "member"
    val fcm_token: String?,
    val created_at: String,
)

data class UpdateUserRequest(
    val name: String? = null,
    val current_password: String? = null,
    val new_password: String? = null,
    val fcm_token: String? = null,
)

data class UpdateRoleRequest(val role: String)

data class HouseholdMemberDto(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
)

data class InviteResponse(val inviteUrl: String)
