package com.servl.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class ServlApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_HOPPER_ALERTS,
                    "Hopper Alerts",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "Alerts when the food hopper is running low and needs refilling"
                }
            )

            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_FEED_FAILED,
                    "Feed Failures",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "Alerts when a scheduled feed could not be delivered"
                }
            )

            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_OVERFEED,
                    "Daily Limit Alerts",
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply {
                    description = "Alerts when a pet exceeds their daily food target"
                }
            )
        }
    }

    companion object {
        const val CHANNEL_HOPPER_ALERTS      = "hopper_alerts"
        const val CHANNEL_FEED_FAILED        = "feed_failed"
        const val CHANNEL_OVERFEED           = "overfeed_alerts"
    }
}
