package com.servl.app

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.servl.app.data.repository.UserRepository
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Handles incoming FCM messages and token refresh events.
 *
 * On new token: sends the token to the backend via PATCH /users/me so the server
 * can target this device for push notifications (low-hopper alerts, feed confirmations).
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
        // Notification messages from FCM are displayed automatically by the system when the
        // app is in the background. For data-only messages we could show a local notification here.
        // For now, the backend sends notification messages so no extra work is needed.
    }
}
