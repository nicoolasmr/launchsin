import {
    SourceConnection,
    SourceConnectionDTO,
    SyncRun,
    SyncRunDTO,
    DlqEvent,
    DlqEventDTO,
    IntegrationAlert,
    IntegrationAlertDTO
} from './types';

/**
 * Transforms a raw DB source connection into a Safe DTO.
 * Explicitly excludes config_json and any potential credentials.
 */
export const toSafeSourceConnectionDTO = (conn: SourceConnection, healthScore: number = 100): SourceConnectionDTO => {
    return {
        id: conn.id,
        type: conn.type,
        name: conn.name,
        is_active: conn.is_active,
        health_score: healthScore,
        last_sync_at: conn.updated_at // Fallback to updated_at if no runs exist
    };
};

export const toSafeRunDTO = (run: SyncRun): SyncRunDTO => {
    return {
        id: run.id,
        status: run.status,
        started_at: run.started_at,
        finished_at: run.finished_at,
        error_message: run.error_message,
        stats: run.stats_json
    };
};

export const toSafeDlqDTO = (dlq: DlqEvent): DlqEventDTO => {
    return {
        id: dlq.id,
        status: dlq.status,
        error_message: dlq.error_message,
        retry_count: dlq.retry_count,
        created_at: dlq.created_at
    };
};

export const toSafeAlertDTO = (alert: IntegrationAlert): IntegrationAlertDTO => {
    return {
        id: alert.id,
        severity: alert.severity,
        message: alert.message,
        is_resolved: alert.is_resolved,
        created_at: alert.created_at
    };
};
