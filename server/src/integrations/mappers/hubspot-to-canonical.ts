import { CanonicalEvent, eventIngestService } from '../../services/event-ingest';

export class HubSpotMapper {
    /**
     * Maps HubSpot Contact to Canonical Event (crm_contact_upsert)
     */
    static mapContact(
        contact: any,
        ctx: { orgId: string; projectId: string; connectionId: string }
    ): CanonicalEvent {
        const { properties, id, updatedAt } = contact;
        const email = properties.email;
        const phone = properties.phone || properties.mobilephone;
        const firstname = properties.firstname || '';
        const lastname = properties.lastname || '';
        const fullName = `${firstname} ${lastname}`.trim();
        const lifecycleStage = properties.lifecyclestage;

        // Hash PII
        const pii = eventIngestService.sanitizeAndHashPII({ email, phone }, ctx.orgId);

        return {
            org_id: ctx.orgId,
            project_id: ctx.projectId,
            source_connection_id: ctx.connectionId,
            event_type: 'crm_contact_upsert',
            event_time: new Date(updatedAt).toISOString(),
            idempotency_key: `hubspot_contact_${id}_${updatedAt}`,
            actor_json: {
                user_id: id, // HubSpot Internal ID as actor ID
                email_hash: pii.email_hash,
                phone_hash: pii.phone_hash
            },
            entities_json: {
                hubspot_id: id,
                full_name: fullName,
                lifecycle_stage: lifecycleStage,
                raw_snapshot: {
                    // Store safe properties allowed for materialized view
                    properties: {
                        firstname,
                        lastname,
                        lifecyclestage: lifecycleStage,
                        createdate: properties.createdate,
                        lastmodifieddate: properties.lastmodifieddate
                    }
                }
            },
            value_json: {},
            raw_ref_json: {
                source_event_id: `${id}_${updatedAt}`,
                source: 'hubspot',
                payload_version: 'v3'
            }
        };
    }

    /**
     * Maps HubSpot Deal to Canonical Event (crm_deal_upsert)
     */
    static mapDeal(
        deal: any,
        ctx: { orgId: string; projectId: string; connectionId: string }
    ): CanonicalEvent {
        const { properties, id, updatedAt } = deal;
        const dealname = properties.dealname;
        const amount = parseFloat(properties.amount || '0');
        const dealstage = properties.dealstage;

        return {
            org_id: ctx.orgId,
            project_id: ctx.projectId,
            source_connection_id: ctx.connectionId,
            event_type: 'crm_deal_upsert',
            event_time: new Date(updatedAt).toISOString(),
            idempotency_key: `hubspot_deal_${id}_${updatedAt}`,
            actor_json: {}, // Deals usually don't have direct actor unless owner
            entities_json: {
                hubspot_id: id,
                deal_name: dealname,
                stage: dealstage,
                raw_snapshot: {
                    properties: {
                        dealname,
                        dealstage,
                        amount: properties.amount,
                        closedate: properties.closedate,
                        createdate: properties.createdate,
                        lastmodifieddate: properties.lastmodifieddate
                    }
                }
            },
            value_json: {
                amount: amount,
                currency: 'USD' // Default (HubSpot usually returns currency code, but v1 assumption)
            },
            raw_ref_json: {
                source_event_id: `${id}_${updatedAt}`,
                source: 'hubspot',
                payload_version: 'v3'
            }
        };
    }
}
