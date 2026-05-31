package com.servl.app.data.repository

import android.content.Context
import android.net.Uri
import com.servl.app.data.network.ApiService
import com.servl.app.data.network.dto.*
import dagger.hilt.android.qualifiers.ApplicationContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UserRepository @Inject constructor(
    private val api: ApiService,
    @param:ApplicationContext private val context: Context,
) {
    suspend fun getMe(): UserDto = api.getMe()

    suspend fun updateMe(name: String? = null, currentPw: String? = null, newPw: String? = null) =
        api.updateMe(UpdateUserRequest(name = name, current_password = currentPw, new_password = newPw))

    suspend fun updateFcmToken(token: String) =
        api.updateMe(UpdateUserRequest(fcm_token = token))

    suspend fun uploadPhoto(uri: Uri): UserDto {
        val bytes = context.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
        val part = MultipartBody.Part.createFormData(
            name = "photo",
            filename = "photo.jpg",
            body = bytes.toRequestBody("image/jpeg".toMediaType()),
        )
        return api.uploadPhoto(part)
    }

    suspend fun getHousehold() = api.getHousehold()

    suspend fun getHouseholdSettings() = api.getHouseholdSettings()

    suspend fun updateHouseholdTimezone(timezone: String) =
        api.updateHouseholdSettings(UpdateHouseholdSettingsRequest(timezone))

    suspend fun generateInvite() = api.generateInvite()

    suspend fun joinHousehold(token: String) = api.joinHousehold(JoinHouseholdRequest(token))

    suspend fun updateRole(userId: String, role: String) =
        api.updateRole(userId, UpdateRoleRequest(role))

    suspend fun removeMember(userId: String) = api.removeMember(userId)
}
