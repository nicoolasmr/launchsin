/**
 * SafeDTO Utility
 * 
 * Ensures that API responses only contain whitelisted fields.
 * NEVER returns the raw database row.
 */

export function toSafeDTO<T extends object, K extends keyof T>(
    data: T,
    whitelist: K[]
): Pick<T, K> {
    const result = {} as Pick<T, K>;
    whitelist.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
            result[key] = data[key];
        }
    });
    return result;
}

export function toSafeDTOList<T extends object, K extends keyof T>(
    data: T[],
    whitelist: K[]
): Pick<T, K>[] {
    return data.map((item) => toSafeDTO(item, whitelist));
}

// --- Domain DTOs ---

export interface ProjectDTO {
    id: string;
    org_id: string;
    name: string;
    created_at: string;
}

export const ProjectWhitelist: (keyof ProjectDTO)[] = ['id', 'org_id', 'name', 'created_at'];

export interface AuditLogDTO {
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    actor_user_id: string;
    created_at: string;
}

export const AuditLogWhitelist: (keyof AuditLogDTO)[] = [
    'id', 'action', 'entity_type', 'entity_id', 'actor_user_id', 'created_at'
];
