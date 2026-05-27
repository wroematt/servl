package com.servl.app.data.repository

import com.servl.app.data.network.ApiService
import com.servl.app.data.network.dto.CreateScheduleRequest
import com.servl.app.data.network.dto.UpdateScheduleRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ScheduleRepository @Inject constructor(private val api: ApiService) {
    suspend fun getSchedules(petId: String? = null) = api.getSchedules(petId)

    suspend fun createSchedule(
        petId: String,
        label: String?,
        feedType: String,
        weightG: Int,
        cronExpression: String,
    ) = api.createSchedule(CreateScheduleRequest(petId, label, feedType, weightG, cronExpression))

    suspend fun updateSchedule(
        scheduleId: String,
        label: String? = null,
        feedType: String? = null,
        weightG: Int? = null,
        cronExpression: String? = null,
        enabled: Boolean? = null,
    ) = api.updateSchedule(scheduleId, UpdateScheduleRequest(label, feedType, weightG, cronExpression, enabled))

    suspend fun deleteSchedule(scheduleId: String) = api.deleteSchedule(scheduleId)
}
