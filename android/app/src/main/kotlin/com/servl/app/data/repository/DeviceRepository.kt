package com.servl.app.data.repository

import com.servl.app.data.network.ApiService
import com.servl.app.data.network.dto.ProvisionDeviceRequest
import com.servl.app.data.network.dto.UpdateDeviceRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceRepository @Inject constructor(private val api: ApiService) {
    suspend fun getDevices() = api.getDevices()

    suspend fun getDevice(deviceId: String) = api.getDevice(deviceId)

    suspend fun provisionDevice(name: String, serialNumber: String, timezone: String) =
        api.provisionDevice(ProvisionDeviceRequest(name, serialNumber, timezone))

    suspend fun updateDevice(deviceId: String, name: String) =
        api.updateDevice(deviceId, UpdateDeviceRequest(name))

    suspend fun deleteDevice(deviceId: String) = api.deleteDevice(deviceId)

    suspend fun getDeviceEvents(deviceId: String, page: Int = 1, pageSize: Int = 20) =
        api.getDeviceEvents(deviceId, page, pageSize)
}
