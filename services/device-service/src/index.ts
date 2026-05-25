import 'express-async-errors';
import express from 'express';
import { config } from './config';
import { devicesRouter } from './routes/devices';
import { internalRouter } from './routes/internal';
import { errorHandler } from './middleware/error';
import { connectMqtt } from './lib/mqtt';

const app = express();
app.use(express.json());

app.use('/devices', devicesRouter);
app.use('/internal', internalRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`device-service listening on :${config.PORT}`);
  connectMqtt();
});
