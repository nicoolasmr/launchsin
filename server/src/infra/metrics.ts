import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

// Create a Registry
export const register = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({ register });

// ============================================================
// HTTP METRICS
// ============================================================

export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_ms',
    help: 'Duration of HTTP requests in milliseconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000],
    registers: [register]
});

// ============================================================
// ALIGNMENT METRICS
// ============================================================

export const alignmentJobsProcessed = new Counter({
    name: 'alignment_jobs_processed_total',
    help: 'Total number of alignment jobs processed',
    labelNames: ['result'], // 'ok' | 'error'
    registers: [register]
});

export const alignmentJobsCached = new Counter({
    name: 'alignment_jobs_cached_total',
    help: 'Total number of alignment jobs served from cache',
    registers: [register]
});

export const alignmentLlmCost = new Counter({
    name: 'alignment_llm_cost_usd_total',
    help: 'Total LLM cost in USD for alignment jobs',
    registers: [register]
});

// ============================================================
// HOME ACTION METRICS
// ============================================================

export const homeActionsExecuted = new Counter({
    name: 'home_actions_executed_total',
    help: 'Total number of home actions executed',
    labelNames: ['action_type', 'status'], // status: 'success' | 'error'
    registers: [register]
});

// ============================================================
// AUDIT LOG METRICS
// ============================================================

export const auditLogsWritten = new Counter({
    name: 'audit_logs_written_total',
    help: 'Total number of audit logs written',
    registers: [register]
});

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Increment alignment job counter
 */
export function recordAlignmentJob(result: 'ok' | 'error') {
    alignmentJobsProcessed.inc({ result });
}

/**
 * Increment cached job counter
 */
export function recordCachedJob() {
    alignmentJobsCached.inc();
}

/**
 * Add LLM cost
 */
export function recordLlmCost(costUsd: number) {
    alignmentLlmCost.inc(costUsd);
}

/**
 * Record home action execution
 */
export function recordHomeAction(actionType: string, status: 'success' | 'error') {
    homeActionsExecuted.inc({ action_type: actionType, status });
}

/**
 * Record audit log write
 */
export function recordAuditLog() {
    auditLogsWritten.inc();
}

/**
 * Middleware to track HTTP request duration
 */
export function metricsMiddleware(req: any, res: any, next: any) {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const route = req.route?.path || req.path || 'unknown';
        const method = req.method;
        const status = res.statusCode;

        httpRequestDuration.observe({ method, route, status }, duration);
    });

    next();
}
