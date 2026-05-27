package com.servl.app.ui.schedule

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.servl.app.data.network.dto.PetDto
import com.servl.app.data.network.dto.ScheduleDto
import com.servl.app.data.repository.PetRepository
import com.servl.app.data.repository.ScheduleRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ScheduleViewModel @Inject constructor(
    private val scheduleRepository: ScheduleRepository,
    private val petRepository: PetRepository,
) : ViewModel() {

    private val _schedules = MutableStateFlow<List<ScheduleDto>>(emptyList())
    val schedules: StateFlow<List<ScheduleDto>> = _schedules.asStateFlow()

    private val _pets = MutableStateFlow<List<PetDto>>(emptyList())
    val pets: StateFlow<List<PetDto>> = _pets.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            try {
                _schedules.value = scheduleRepository.getSchedules()
                _pets.value = petRepository.getPets()
            } catch (e: Exception) { _error.value = e.message }
        }
    }

    fun toggleEnabled(scheduleId: String, enabled: Boolean) {
        viewModelScope.launch {
            try {
                scheduleRepository.updateSchedule(scheduleId, enabled = enabled)
                load()
            } catch (e: Exception) { _error.value = e.message }
        }
    }

    fun deleteSchedule(scheduleId: String) {
        viewModelScope.launch {
            try { scheduleRepository.deleteSchedule(scheduleId); load() }
            catch (e: Exception) { _error.value = e.message }
        }
    }

    fun createSchedule(
        petId: String, label: String?, feedType: String, weightG: Int, cronExpression: String,
        onSuccess: () -> Unit,
    ) {
        viewModelScope.launch {
            _error.value = null
            try {
                scheduleRepository.createSchedule(petId, label, feedType, weightG, cronExpression)
                load()
                onSuccess()
            } catch (e: Exception) { _error.value = e.message ?: "Failed to create schedule" }
        }
    }

    fun updateSchedule(
        scheduleId: String, petId: String, label: String?, feedType: String, weightG: Int, cronExpression: String,
        onSuccess: () -> Unit,
    ) {
        viewModelScope.launch {
            _error.value = null
            try {
                scheduleRepository.updateSchedule(scheduleId, label = label, feedType = feedType, weightG = weightG, cronExpression = cronExpression)
                load()
                onSuccess()
            } catch (e: Exception) { _error.value = e.message ?: "Failed to update schedule" }
        }
    }

    fun clearError() { _error.value = null }

    /** Parse "MM HH * * DOW" cron into a human-readable label like "Daily at 08:30" */
    fun cronToLabel(cron: String): String {
        val parts = cron.split(" ")
        if (parts.size < 5) return cron
        val minute = parts[0].padStart(2, '0')
        val hour   = parts[1].padStart(2, '0')
        val dow    = parts[4]
        val timeStr = "$hour:$minute"
        return if (dow == "*") "Daily at $timeStr"
        else {
            val days = dow.split(",").mapNotNull {
                when (it.trim()) {
                    "0", "7" -> "Sun"; "1" -> "Mon"; "2" -> "Tue"
                    "3" -> "Wed"; "4" -> "Thu"; "5" -> "Fri"; "6" -> "Sat"
                    else -> null
                }
            }.joinToString(", ")
            "$days at $timeStr"
        }
    }
}
