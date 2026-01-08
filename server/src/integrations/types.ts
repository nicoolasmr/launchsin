export enum IntegrationProvider {
    HOTMART = 'hotmart',
    META_ADS = 'meta_ads',
    GOOGLE_ADS = 'google_ads',
    HUBSPOT = 'hubspot'
}

export interface SourceConnection {
    id: string;
    org_id: string;
    project_id: string;
    type: IntegrationProvider;
    name: string;
    config_json: any;
    state_json?: any;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    last_sync_at?: string;
    last_success_at?: string;
    last_error_at?: string;
    last_error_class?: string;
}

export interface SyncRun {
    id: string;
    connection_id: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'partial';
    started_at: string;
    finished_at?: string;
    error_message?: string;
    stats_json: any;
    created_at: string;
}

export interface DlqEvent {
    id: string;
    connection_id: string;
    payload_json: any;
    error_message?: string;
    status: 'pending' | 'retrying' | 'resolved' | 'ignored';
    retry_count: number;
    created_at: string;
    updated_at: string;
}

export interface IntegrationAlert {
    id: string;
    project_id: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    is_resolved: boolean;
    metadata_json: any;
    created_at: string;
}

// DTOs (Whitelisted responses)

export interface SourceConnectionDTO {
    id: string;
    org_id: string;
    project_id: string;
    type: IntegrationProvider;
    name: string;
    is_active: boolean;
    health_score: number;
    last_sync_at?: string;
    last_success_at?: string;
    last_error_at?: string;
    last_error_class?: string;
    has_token: boolean;
    display_name?: string;
    capabilities?: {
        oauth: boolean;
        incremental_sync: boolean;
    };
    created_at?: string;
    updated_at?: string;
}

export interface SyncRunDTO {
    id: string;
    status: string;
    started_at: string;
    finished_at?: string;
    error_message?: string;
    stats: any;
}

export interface DlqEventDTO {
    id: string;
    status: string;
    error_message?: string;
    retry_count: number;
    created_at: string;
}

export interface IntegrationAlertDTO {
    id: string;
    severity: string;
    message: string;
    is_resolved: boolean;
    created_at: string;
}

export interface HealthReportDTO {
    score: number;
    status: 'healthy' | 'degraded' | 'critical';
    factors: {
        alerts_count: number;
        dlq_count: number;
        latency_minutes: number;
    };
}
