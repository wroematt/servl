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
  data?: Record<string, string>,
) {
  const messaging = getMessaging();
  if (!messaging) return; // placeholder creds in local dev — skip silently

  try {
    await messaging.send({ token, notification: { title, body }, data });
  } catch (err) {
    // Log but don't throw — notification failures must not block the caller
    console.error(`FCM send failed for token ${token.slice(0, 10)}…:`, err);
  }
}
