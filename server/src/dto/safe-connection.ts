/**
 * Safe DTO for Source Connections
 * 
 * This module provides utilities to transform source_connections database records
 * into safe DTOs that never expose sensitive data (config_json, secret_ref_id, etc.)
 */

export interface SafeSourceConnectionDTO {
    id: string;
    provider: string;
    status: string;
    created_at: string;
    updated_at: string;
    has_token: boolean;
    last_sync_at?: string;
    health_summary?: {
        status: 'healthy' | 'degraded' | 'down';
        last_check_at?: string;
        error_count_24h?: number;
    };
}

export interface SourceConnectionRecord {
    id: string;
    org_id: string;
    project_id: string;
    provider: string;
    status: string;
    config_json?: Record<string, any>;
    secret_ref_id?: string;
    created_at: string;
    updated_at: string;
    last_sync_at?: string;
    [key: string]: any;
}

/**
 * Transform a source_connection record into a safe DTO
 * 
 * @param connection - Raw database record
 * @returns Safe DTO with no sensitive fields
 */
export function toSafeSourceConnectionDTO(
    connection: SourceConnectionRecord
): SafeSourceConnectionDTO {
    return {
        id: connection.id,
        provider: connection.provider,
        status: connection.status,
        created_at: connection.created_at,
        updated_at: connection.updated_at,
        has_token: !!connection.secret_ref_id,
        last_sync_at: connection.last_sync_at,
        health_summary: connection.health_summary || {
            status: 'healthy',
            last_check_at: connection.updated_at,
            error_count_24h: 0
        }
    };
}

/**
 * Transform an array of connections into safe DTOs
 */
export function toSafeSourceConnectionDTOs(
    connections: SourceConnectionRecord[]
): SafeSourceConnectionDTO[] {
    return connections.map(toSafeSourceConnectionDTO);
}
