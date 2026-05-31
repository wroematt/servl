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
class PetRepository @Inject constructor(
    private val api: ApiService,
    @param:ApplicationContext private val context: Context,
) {
    suspend fun getPets() = api.getPets()

    suspend fun getPet(petId: String) = api.getPet(petId)

    suspend fun createPet(
        name: String,
        type: String,
        mealWeightG: Int,
        snackWeightG: Int,
        dailyTargetG: Int,
        photoUri: Uri?,
        deviceId: String? = null,
    ): PetDto {
        val parts = mutableMapOf(
            "name"           to name.toRequestBody(),
            "type"           to type.toRequestBody(),
            "meal_weight_g"  to mealWeightG.toString().toRequestBody(),
            "snack_weight_g" to snackWeightG.toString().toRequestBody(),
            "daily_target_g" to dailyTargetG.toString().toRequestBody(),
        )
        if (deviceId != null) parts["device_id"] = deviceId.toRequestBody()
        val photoPart = photoUri?.toPhotoPart(context)
        return api.createPet(parts, photoPart)
    }

    suspend fun updatePet(
        petId: String,
        name: String,
        type: String,
        mealWeightG: Int,
        snackWeightG: Int,
        dailyTargetG: Int,
        photoUri: Uri?,
        deviceId: String? = null,
    ): PetDto {
        return if (photoUri != null) {
            val parts = mutableMapOf(
                "name"           to name.toRequestBody(),
                "type"           to type.toRequestBody(),
                "meal_weight_g"  to mealWeightG.toString().toRequestBody(),
                "snack_weight_g" to snackWeightG.toString().toRequestBody(),
                "daily_target_g" to dailyTargetG.toString().toRequestBody(),
            )
            if (deviceId != null) parts["device_id"] = deviceId.toRequestBody()
            api.updatePetMultipart(petId, parts, photoUri.toPhotoPart(context))
        } else {
            val body = mutableMapOf<String, Any?>(
                "name"           to name,
                "type"           to type,
                "meal_weight_g"  to mealWeightG,
                "snack_weight_g" to snackWeightG,
                "daily_target_g" to dailyTargetG,
            )
            // Pass null explicitly to unassign, or omit if unchanged (pass same value)
            body["device_id"] = deviceId
            api.updatePet(petId, body)
        }
    }

    suspend fun deletePet(petId: String) = api.deletePet(petId)

    suspend fun getFeedHistory(
        petId: String,
        page: Int = 1,
        pageSize: Int = 20,
        from: String? = null,
        to: String? = null,
        triggerType: String? = null,
    ) = api.getFeedHistory(petId, page, pageSize, from, to, triggerType)

    suspend fun getPetStats(petId: String, from: String, to: String) =
        api.getPetStats(petId, from, to)

    private fun String.toRequestBody() =
        toRequestBody("text/plain".toMediaType())

    private fun Uri.toPhotoPart(ctx: Context): MultipartBody.Part {
        val bytes = ctx.contentResolver.openInputStream(this)!!.use { it.readBytes() }
        return MultipartBody.Part.createFormData(
            name = "photo",
            filename = "photo.jpg",
            body = bytes.toRequestBody("image/jpeg".toMediaType()),
        )
    }
}
