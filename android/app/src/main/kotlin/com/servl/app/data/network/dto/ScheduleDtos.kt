package com.servl.app.data.network.dto

data class ScheduleDto(
    val id: String,
    val pet_id: String,
    val pet_name: String?,
    val label: String?,
    val feed_type: String,          // "meal" | "snack" | "custom"
    val weight_g: Int,
    val cron_expression: String,
    val enabled: Boolean,
    val created_at: String,
)

data class CreateScheduleRequest(
    val pet_id: String,
    val label: String?,
    val feed_type: String,
    val weight_g: Int,
    val cron_expression: String,
)

data class UpdateScheduleRequest(
    val label: String? = null,
    val feed_type: String? = null,
    val weight_g: Int? = null,
    val cron_expression: String? = null,
    val enabled: Boolean? = null,
)
