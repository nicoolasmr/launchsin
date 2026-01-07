import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from './infra/structured-logger';
import routes from './routes';
import { metricsRegistry, httpRequestDurationMicroseconds } from './utils/metrics';

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Metrics Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDurationMicroseconds.labels(req.method, req.path, res.statusCode.toString()).observe(duration);
  });
  next();
});

// Example Metrics Endpoint (should be protected in prod or internal only)
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

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
