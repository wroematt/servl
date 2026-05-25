import 'express-async-errors';
import express from 'express';
import { config } from './config';
import { internalRouter } from './routes/internal';
import { errorHandler } from './middleware/error';

const app = express();
app.use(express.json());

app.use('/internal', internalRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

app.listen(config.PORT, () => console.log(`notification-service listening on :${config.PORT}`));
