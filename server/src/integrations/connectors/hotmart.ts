import crypto from 'crypto';
import { logger } from '../../infra/structured-logger';
import { CanonicalEvent, eventIngestService } from '../../services/event-ingest';

/**
 * Hotmart Connector
 * 
 * Handles webhook events from Hotmart with:
 * - Hottok validation (HMAC-SHA256)
 * - Event mapping to canonical schema
 * - Idempotency key generation
 */

export interface HotmartWebhookPayload {
    id: string;
    event: string; // PURCHASE_COMPLETE, PURCHASE_REFUNDED, etc.
    version: string;
    data: {
        purchase: {
            transaction: string;
            status: string;
            order_date: number; // Unix timestamp
            approved_date?: number;
            buyer: {
                email: string;
                name: string;
                phone?: string;
            };
            product: {
                id: number;
                name: string;
            };
            price: {
                value: number;
                currency_code: string;
            };
            payment?: {
                type: string;
            };
        };
    };
}

export class HotmartConnector {
    /**
     * Validate Hottok signature
     * 
     * Hotmart sends X-Hotmart-Hottok header with HMAC-SHA256 signature
     */
    public static validateHottok(payload: string, hottok: string, secret: string): boolean {
        try {
            const expectedHottok = crypto
                .createHmac('sha256', secret)
                .update(payload)
                .digest('hex');

            return crypto.timingSafeEqual(
                Buffer.from(hottok),
                Buffer.from(expectedHottok)
            );
        } catch (error: any) {
            logger.error('Hottok validation error', { error: error.message });
            return false;
        }
    }

    /**
     * Map Hotmart event to canonical events
     */
    public static mapToCanonicalEvents(
        payload: HotmartWebhookPayload,
        orgId: string,
        projectId: string,
        connectionId: string
    ): CanonicalEvent[] {
        const events: CanonicalEvent[] = [];
        const purchase = payload.data.purchase;

        // Determine event type
        let eventType: string;
        let eventTime: string;

        switch (payload.event) {
            case 'PURCHASE_COMPLETE':
            case 'PURCHASE_APPROVED':
                eventType = 'purchase_completed';
                eventTime = new Date((purchase.approved_date || purchase.order_date) * 1000).toISOString();
                break;
            case 'PURCHASE_REFUNDED':
            case 'PURCHASE_CHARGEBACK':
                eventType = 'refund_created';
                eventTime = new Date(purchase.order_date * 1000).toISOString();
                break;
            case 'PURCHASE_CANCELED':
                eventType = 'checkout_started'; // Canceled checkout
                eventTime = new Date(purchase.order_date * 1000).toISOString();
                break;
            default:
                logger.warn('Unknown Hotmart event type', { event: payload.event });
                return events;
        }

        // Hash PII
        const actorData = eventIngestService.sanitizeAndHashPII(
            {
                email: purchase.buyer.email,
                phone: purchase.buyer.phone
            },
            orgId
        );

        // Build canonical event
        const canonicalEvent: CanonicalEvent = {
            org_id: orgId,
            project_id: projectId,
            source_connection_id: connectionId,
            event_type: eventType,
            event_time: eventTime,
            idempotency_key: this.computeIdempotencyKey(payload),
            actor_json: actorData,
            entities_json: {
                product_id: purchase.product.id.toString(),
                product_name: purchase.product.name,
                order_id: purchase.transaction,
                payment_type: purchase.payment?.type
            },
            value_json: {
                amount: purchase.price.value,
                currency: purchase.price.currency_code,
                status: purchase.status
            },
            raw_ref_json: {
                source_event_id: payload.id,
                source: 'hotmart',
                payload_version: payload.version
            }
        };

        events.push(canonicalEvent);
        return events;
    }

    /**
     * Compute idempotency key
     */
    public static computeIdempotencyKey(payload: HotmartWebhookPayload): string {
        // Use Hotmart's unique transaction ID
        const transactionId = payload.data.purchase.transaction;
        const eventType = payload.event;
        return `hotmart_${transactionId}_${eventType}`;
    }
}
