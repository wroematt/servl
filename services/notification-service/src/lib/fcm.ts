import * as admin from 'firebase-admin';
import { config } from '../config';

// Lazily initialised — defers Firebase credential parsing until first use.
// This allows the service to start cleanly with placeholder credentials in
// local development; notifications are silently skipped in that case.
let _messaging: admin.messaging.Messaging | null = null;
let _initAttempted = false;

function getMessaging(): admin.messaging.Messaging | null {
  if (_initAttempted) return _messaging;
  _initAttempted = true;
  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.FCM_PROJECT_ID,
        clientEmail: config.FCM_CLIENT_EMAIL,
        // Env vars store \n literally; replace with real newlines
        privateKey: config.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
    _messaging = admin.messaging(app);
  } catch (err) {
    console.warn('Firebase Admin SDK init failed — push notifications disabled:', (err as Error).message);
  }
  return _messaging;
}

export async function sendToToken(
  token: string,
  title: string,
  body: string,
  channelId: string,
  data?: Record<string, string>,
) {
  const messaging = getMessaging();
  if (!messaging) {
    console.error('[FCM] Cannot send notification — Firebase Admin SDK not initialised. Check FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY in .env.');
    return;
  }

  console.log(`[FCM] Sending "${title}" (channel: ${channelId}) to token ${token.slice(0, 15)}…`);
  try {
    const result = await messaging.send({
      token,
      notification: { title, body },
      // Route the notification to the correct Android channel so each type can
      // be individually enabled / disabled in the system notification settings.
      android: { notification: { channelId } },
      data,
    });
    console.log(`[FCM] Delivered — message ID: ${result}`);
  } catch (err) {
    // Log but don't throw — notification failures must not block the caller
    console.error(`[FCM] Send failed for token ${token.slice(0, 15)}…:`, err);
  }
}
