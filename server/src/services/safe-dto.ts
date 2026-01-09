
/**
 * SafeDTO: Centralized sanitation for API responses.
 * Ensures zero leakage of secrets or internal IDs.
 */

export class SafeDTO {

    static toSchedule(schedule: any) {
        const { org_id, ...rest } = schedule;
        return rest;
    }

    static toNotification(notification: any) {
        const { org_id, webhook_secret_ref_id, ...rest } = notification;
        return {
            ...rest,
            webhook_configured: !!webhook_secret_ref_id
        };
    }

    static toReportV2(report: any) {
        const { org_id, source_connection_id, model_info, ...rest } = report;
        return {
            ...rest,
            model_info: model_info ? { model: model_info.model } : null // Strip debug trace
        };
    }

    static toDiff(diff: any) {
        const { org_id, ...rest } = diff;
        return rest;
    }
}
