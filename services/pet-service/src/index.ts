import 'express-async-errors';
import express from 'express';
import { config } from './config';
import { petsRouter } from './routes/pets';
import { schedulesRouter } from './routes/schedules';
import { errorHandler } from './middleware/error';

const app = express();
app.use(express.json());

// Serve uploaded pet photos — stored by multer at config.MEDIA_UPLOAD_PATH
app.use('/uploads', express.static(config.MEDIA_UPLOAD_PATH));

app.use('/pets', petsRouter);
app.use('/schedules', schedulesRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

app.listen(config.PORT, () => console.log(`pet-service listening on :${config.PORT}`));
