import * as admin from 'firebase-admin';
import { config } from '../config';

const firebaseApp = admin.initializeApp({
  credential: admin.credential.cert({
    projectId: config.FCM_PROJECT_ID,
    clientEmail: config.FCM_CLIENT_EMAIL,
    // Env vars store \n literally; replace with real newlines
    privateKey: config.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const messaging = admin.messaging(firebaseApp);

export async function sendToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  try {
    await messaging.send({ token, notification: { title, body }, data });
  } catch (err) {
    // Log but don't throw — notification failures must not block the caller
    console.error(`FCM send failed for token ${token.slice(0, 10)}…:`, err);
  }
}
