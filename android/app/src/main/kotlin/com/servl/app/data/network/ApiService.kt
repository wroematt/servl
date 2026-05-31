package com.servl.app.data.network

import com.servl.app.data.network.dto.*
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.*

interface ApiService {

    // ── Auth ──────────────────────────────────────────────────────────────────

    @POST("auth/login")
    suspend fun login(@Body req: LoginRequest): AuthResponse

    @POST("auth/register")
    suspend fun register(@Body req: RegisterRequest): AuthResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body req: RefreshRequest): RefreshResponse

    @POST("auth/logout")
    suspend fun logout()

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body req: ForgotPasswordRequest)

    @POST("auth/reset-password")
    suspend fun resetPassword(@Body req: ResetPasswordRequest)

    // ── Users ─────────────────────────────────────────────────────────────────

    @GET("users/me")
    suspend fun getMe(): UserDto

    @PATCH("users/me")
    suspend fun updateMe(@Body req: UpdateUserRequest): UserDto

    @Multipart
    @POST("users/me/photo")
    suspend fun uploadPhoto(@Part photo: MultipartBody.Part): UserDto

    @GET("users/household")
    suspend fun getHousehold(): List<HouseholdMemberDto>

    @GET("users/household/settings")
    suspend fun getHouseholdSettings(): HouseholdSettingsDto

    @PATCH("users/household/settings")
    suspend fun updateHouseholdSettings(@Body req: UpdateHouseholdSettingsRequest): HouseholdSettingsDto

    @POST("users/household/invite")
    suspend fun generateInvite(): InviteResponse

    @POST("users/household/join")
    suspend fun joinHousehold(@Body req: JoinHouseholdRequest): UserDto

    @PATCH("users/{userId}/role")
    suspend fun updateRole(
        @Path("userId") userId: String,
        @Body req: UpdateRoleRequest,
    ): HouseholdMemberDto

    @DELETE("users/{userId}")
    suspend fun removeMember(@Path("userId") userId: String)

    // ── Pets ──────────────────────────────────────────────────────────────────

    @GET("pets")
    suspend fun getPets(): List<PetDto>

    @GET("pets/{petId}")
    suspend fun getPet(@Path("petId") petId: String): PetDto

    @Multipart
    @POST("pets")
    suspend fun createPet(
        @PartMap parts: Map<String, @JvmSuppressWildcards RequestBody>,
        @Part photo: MultipartBody.Part?,
    ): PetDto

    @Multipart
    @PATCH("pets/{petId}")
    suspend fun updatePetMultipart(
        @Path("petId") petId: String,
        @PartMap parts: Map<String, @JvmSuppressWildcards RequestBody>,
        @Part photo: MultipartBody.Part?,
    ): PetDto

    @PATCH("pets/{petId}")
    suspend fun updatePet(
        @Path("petId") petId: String,
        @Body req: Map<String, @JvmSuppressWildcards Any?>,
    ): PetDto

    @DELETE("pets/{petId}")
    suspend fun deletePet(@Path("petId") petId: String)

    @GET("pets/{petId}/feeds")
    suspend fun getFeedHistory(
        @Path("petId") petId: String,
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 20,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("trigger_type") triggerType: String? = null,
    ): FeedHistoryResponse

    @GET("pets/{petId}/stats")
    suspend fun getPetStats(
        @Path("petId") petId: String,
        @Query("from") from: String,
        @Query("to") to: String,
    ): List<PetStatsDto>

    // ── Feed ──────────────────────────────────────────────────────────────────

    @POST("feed/meal")
    suspend fun feedMeal(@Body req: FeedRequest): FeedEventDto

    @POST("feed/snack")
    suspend fun feedSnack(@Body req: FeedRequest): FeedEventDto

    @POST("feed/custom")
    suspend fun feedCustom(@Body req: CustomFeedRequest): FeedEventDto

    // ── Schedules ─────────────────────────────────────────────────────────────

    @GET("schedules")
    suspend fun getSchedules(@Query("petId") petId: String? = null): List<ScheduleDto>

    @POST("schedules")
    suspend fun createSchedule(@Body req: CreateScheduleRequest): ScheduleDto

    @PATCH("schedules/{scheduleId}")
    suspend fun updateSchedule(
        @Path("scheduleId") scheduleId: String,
        @Body req: UpdateScheduleRequest,
    ): ScheduleDto

    @DELETE("schedules/{scheduleId}")
    suspend fun deleteSchedule(@Path("scheduleId") scheduleId: String)

    // ── Devices ───────────────────────────────────────────────────────────────

    @GET("devices")
    suspend fun getDevices(): List<DeviceDto>

    @GET("devices/{deviceId}")
    suspend fun getDevice(@Path("deviceId") deviceId: String): DeviceDto

    @POST("devices")
    suspend fun provisionDevice(@Body req: ProvisionDeviceRequest): DeviceDto

    @PATCH("devices/{deviceId}")
    suspend fun updateDevice(
        @Path("deviceId") deviceId: String,
        @Body req: UpdateDeviceRequest,
    ): DeviceDto

    @DELETE("devices/{deviceId}")
    suspend fun deleteDevice(@Path("deviceId") deviceId: String)

    @GET("devices/{deviceId}/events")
    suspend fun getDeviceEvents(
        @Path("deviceId") deviceId: String,
        @Query("page") page: Int = 1,
        @Query("page_size") pageSize: Int = 20,
    ): DeviceEventsResponse
}
