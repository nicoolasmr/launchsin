import client from 'prom-client';

// Create a Registry which registers the metrics
const register = new client.Registry();

// Add a default label which is added to all metrics
register.setDefaultLabels({
    app: 'launchsin-server'
});

// Enable the collection of default metrics
client.collectDefaultMetrics({ register });

// Define custom metrics
export const httpRequestDurationMicroseconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 1.5, 2, 5],
    registers: [register]
});

export const alignmentChecksTotal = new client.Counter({
    name: 'alignment_checks_total',
    help: 'Total number of alignment checks performed',
    labelNames: ['project_id', 'status', 'mode'], // mode: manual/scheduled
    registers: [register]
});

export const metricsRegistry = register;
