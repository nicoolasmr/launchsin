import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from './infra/structured-logger';
import routes from './routes';

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Main Routes
app.use('/api', routes);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled Exception', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(port, () => {
  logger.info(`LaunchSin API starting...`, { port, mode: process.env.NODE_ENV });
});

export default app;
