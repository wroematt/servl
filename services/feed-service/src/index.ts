import 'express-async-errors';
import express from 'express';
import { config } from './config';
import { feedRouter } from './routes/feed';
import { webhookRouter } from './routes/webhook';
import { errorHandler } from './middleware/error';

const app = express();

// Webhook route needs raw body for HMAC verification
app.use('/webhook/google-home', express.raw({ type: 'application/json' }), webhookRouter);

app.use(express.json());
app.use('/feed', feedRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

app.listen(config.PORT, () => console.log(`feed-service listening on :${config.PORT}`));
