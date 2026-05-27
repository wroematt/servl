package com.servl.app.data.repository

import com.servl.app.data.network.ApiService
import com.servl.app.data.network.dto.CustomFeedRequest
import com.servl.app.data.network.dto.FeedRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FeedRepository @Inject constructor(private val api: ApiService) {
    suspend fun feedMeal(petId: String)  = api.feedMeal(FeedRequest(petId))
    suspend fun feedSnack(petId: String) = api.feedSnack(FeedRequest(petId))
    suspend fun feedCustom(petId: String, weightG: Int) =
        api.feedCustom(CustomFeedRequest(petId, weightG))
}
