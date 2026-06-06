package com.servl.app

import android.Manifest
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.servl.app.data.repository.UserRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.random.Random

/**
 * Handles incoming FCM messages and token refresh events.
 *
 * On new token: sends the token to the backend via PATCH /users/me so the server
 * can target this device for push notifications (low-hopper alerts, feed confirmations,
 * feed failures, overfeed alerts).
 */
@AndroidEntryPoint
class ServlFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var userRepository: UserRepository

    private val serviceScope = CoroutineScope(Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        serviceScope.launch {
            try { userRepository.updateFcmToken(token) } catch (_: Exception) { /* best-effort */ }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        // IMPORTANT: FCM only auto-displays "notification" payloads when the app is
        // backgrounded or killed. When the app is in the FOREGROUND, the system hands
        // the message to onMessageReceived() instead and shows nothing on its own —
        // so without this, foreground users never see hopper-low / feed / feed-failed /
        // overfeed alerts even though FCM reports the message as "delivered".
        val notification = message.notification ?: return
        val title = notification.title ?: getString(R.string.app_name)
        val body  = notification.body ?: return
        // The backend sets android.notification.channel_id per alert type (see
        // notification-service/src/lib/fcm.ts) so each alert lands in the channel
        // the user configured — fall back to the default FCM channel if absent.
        val channelId = notification.channelId ?: ServlApplication.CHANNEL_FEED_CONFIRMATIONS

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val openAppIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentIntent = openAppIntent?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_servl_logo)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .apply { contentIntent?.let { setContentIntent(it) } }

        NotificationManagerCompat.from(this).notify(Random.nextInt(), builder.build())
    }
}
