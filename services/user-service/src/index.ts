import 'express-async-errors';
import express from 'express';
import { config } from './config';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { errorHandler } from './middleware/error';
import fs from 'fs';

const app = express();
app.use(express.json());

// Ensure user-uploads directory exists at startup
if (!fs.existsSync(config.USER_MEDIA_UPLOAD_PATH)) {
  fs.mkdirSync(config.USER_MEDIA_UPLOAD_PATH, { recursive: true });
}

// Serve user profile photos publicly (no auth required)
app.use('/user-uploads', express.static(config.USER_MEDIA_UPLOAD_PATH));

app.use('/auth', authRouter);
app.use('/users', usersRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

app.listen(config.PORT, () => console.log(`user-service listening on :${config.PORT}`));
