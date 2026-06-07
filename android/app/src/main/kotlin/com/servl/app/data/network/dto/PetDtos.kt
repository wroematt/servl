package com.servl.app.data.network.dto

data class PetDto(
    val id: String,
    val household_id: String,
    val device_id: String?,
    val device_name: String?,
    val name: String,
    val type: String,               // "cat" | "dog" | "other"
    val photo_url: String?,
    val meal_weight_g: Int,
    val snack_weight_g: Int,
    val daily_target_g: Int,
    val today_intake_g: Int,
    // True while a feed_event for this pet is still 'pending' (dispensed but not
    // yet confirmed/failed/timed-out by the device). The backend allows at most
    // one pending feed per pet at a time — used to disable Meal/Snack buttons
    // rather than letting a second dispense request 409 with FEED_IN_PROGRESS.
    // Defaults to false so older API responses without this field still parse.
    val has_pending_feed: Boolean = false,
    val deleted_at: String?,
    val created_at: String,
)

data class FeedEventDto(
    val id: String,
    val pet_id: String?,
    val device_id: String?,
    val triggered_by: String?,
    val triggered_by_name: String?,  // joined from users table; null for scheduled/voice
    val schedule_id: String?,
    val weight_requested_g: Int,
    val weight_dispensed_g: Int?,
    val trigger_type: String,        // "manual" | "schedule" | "voice" | "api"
    val status: String,              // "pending" | "confirmed" | "failed" | "timeout"
    val dispensed_at: String,
)

data class FeedHistoryResponse(
    val data: List<FeedEventDto>,
    val total: Int,
    val page: Int,
    val page_size: Int,
)

data class PetStatsDto(
    val date: String,
    val total_g: Int,
    val feed_count: Int,
)

data class FeedRequest(val petId: String)
data class CustomFeedRequest(val petId: String, val weightG: Int)
