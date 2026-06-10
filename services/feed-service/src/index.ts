import 'express-async-errors';
import express from 'express';
import { config } from './config';
import { feedRouter } from './routes/feed';
import { internalRouter } from './routes/internal';
import { webhookRouter } from './routes/webhook';
import { smarthomeRouter } from './routes/smarthome';
import { errorHandler } from './middleware/error';

const app = express();

// HMAC webhook — must receive the raw body for signature verification.
// Registered before express.json() so the buffer is not consumed first.
app.use('/webhook/google-home', express.raw({ type: 'application/json' }), webhookRouter);

app.use(express.json());

// Smart Home webhook uses JWT Bearer auth (no HMAC), so standard JSON parsing is fine.
app.use('/webhook/smarthome', smarthomeRouter);

app.use('/feed', feedRouter);
app.use('/internal', internalRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

app.listen(config.PORT, () => console.log(`feed-service listening on :${config.PORT}`));
