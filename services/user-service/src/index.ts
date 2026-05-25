import 'express-async-errors';
import express from 'express';
import { config } from './config';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { errorHandler } from './middleware/error';

const app = express();
app.use(express.json());

app.use('/auth', authRouter);
app.use('/users', usersRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

app.listen(config.PORT, () => console.log(`user-service listening on :${config.PORT}`));
