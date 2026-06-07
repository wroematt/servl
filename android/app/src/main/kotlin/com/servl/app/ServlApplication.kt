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

            // Notification channels are persistent system records — once created,
            // they keep showing up (with their own on/off toggle) in the system
            // notification settings forever, even after the app stops calling
            // createNotificationChannel() for them. Removing the "feed served"
            // notification (commit e780ee9) deleted the *creation* code but left
            // the channel itself on already-installed devices, so the toggle kept
            // appearing as if the feature still existed. deleteNotificationChannel
            // is the only way to actually remove it, and is a safe no-op for users
            // who never had the channel (e.g. fresh installs).
            manager.deleteNotificationChannel(LEGACY_CHANNEL_FEED_CONFIRMATIONS)

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

        // Retired channel ID — kept only so onCreate() can delete any
        // lingering instance of it from devices that had it created by an
        // older app version. Do not recreate; do not reuse this ID.
        private const val LEGACY_CHANNEL_FEED_CONFIRMATIONS = "feed_confirmations"
    }
}
