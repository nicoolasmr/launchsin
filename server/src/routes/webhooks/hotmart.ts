import { Request, Response, NextFunction } from 'express';
import { supabase } from '../../infra/db';
import { logger } from '../../infra/structured-logger';
import { HotmartConnector, HotmartWebhookPayload } from '../../integrations/connectors/hotmart';
import { eventIngestService, IngestResult } from '../../services/event-ingest';
import { v4 as uuidv4 } from 'uuid';

/**
 * Hotmart Webhook Handler
 * 
 * POST /api/webhooks/hotmart/:connectionId
 * 
 * Flow:
 * 1. Validate connectionId exists
 * 2. Validate hottok signature
 * 3. Map to canonical events
 * 4. Insert with idempotency
 * 5. On error: DLQ + return 200 OK
 */

export async function handleHotmartWebhook(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const correlationId = uuidv4();
    const connectionId = req.params.connectionId;
    const hottok = req.headers['x-hotmart-hottok'] as string;
    const rawPayload = JSON.stringify(req.body);
    const payload: HotmartWebhookPayload = req.body;

    logger.info('Hotmart webhook received', {
        correlation_id: correlationId,
        connection_id: connectionId,
        event: payload.event
    });

    try {
        // 1. Validate connection exists
        const { data: connection, error: connError } = await supabase
            .from('source_connections')
            .select('id, org_id, project_id, config_json')
            .eq('id', connectionId)
            .eq('type', 'hotmart')
            .eq('is_active', true)
            .single();

        if (connError || !connection) {
            logger.warn('Invalid connection ID', {
                correlation_id: correlationId,
                connection_id: connectionId
            });
            res.status(404).json({ error: 'Connection not found' });
            return;
        }

        // 2. Validate hottok
        const hotmartSecret = connection.config_json?.hotmart_secret || process.env.HOTMART_HOTTOK;
        if (!hotmartSecret) {
            logger.error('Hotmart secret not configured (connection nor env)', {
                correlation_id: correlationId,
                connection_id: connectionId
            });
            await enqueueDLQ(connectionId, payload, 'MISSING_SECRET', 'Hotmart secret not configured');
            res.status(200).json({ received: true }); // Return 200 to prevent retries
            return;
        }

        const isValid = HotmartConnector.validateHottok(rawPayload, hottok, hotmartSecret);
        if (!isValid) {
            logger.warn('Invalid hottok signature', {
                correlation_id: correlationId,
                connection_id: connectionId
            });
            res.status(401).json({ error: 'Invalid signature' });
            return;
        }

        // 3. Map to canonical events
        const canonicalEvents = HotmartConnector.mapToCanonicalEvents(
            payload,
            connection.org_id,
            connection.project_id,
            connectionId
        );

        if (canonicalEvents.length === 0) {
            logger.info('No canonical events generated', {
                correlation_id: correlationId,
                event: payload.event
            });
            res.status(200).json({ received: true });
            return;
        }

        // 4. Insert with idempotency
        const results = await eventIngestService.insertCanonicalEvents(canonicalEvents);

        const successCount = results.filter((r: IngestResult) => r.success).length;
        const duplicateCount = results.filter((r: IngestResult) => r.duplicate).length;
        const failureCount = results.filter((r: IngestResult) => !r.success).length;

        logger.info('Hotmart webhook processed', {
            correlation_id: correlationId,
            connection_id: connectionId,
            success: successCount,
            duplicates: duplicateCount,
            failures: failureCount
        });

        // 5. On failure: DLQ
        if (failureCount > 0) {
            const failedEvent = results.find((r: IngestResult) => !r.success);
            await enqueueDLQ(
                connectionId,
                payload,
                'INSERT_FAILED',
                failedEvent?.error || 'Unknown error'
            );
        }

        // Always return 200 to prevent Hotmart from retrying
        res.status(200).json({
            received: true,
            processed: successCount,
            duplicates: duplicateCount
        });

    } catch (error: any) {
        logger.error('Unexpected error in Hotmart webhook', {
            correlation_id: correlationId,
            error: error.message,
            stack: error.stack
        });

        // Enqueue to DLQ
        await enqueueDLQ(connectionId, payload, 'UNEXPECTED_ERROR', error.message);

        // Return 200 to prevent infinite retries
        res.status(200).json({ received: true, error: 'Internal error, event queued for retry' });
    }
}

/**
 * Enqueue failed event to DLQ
 */
async function enqueueDLQ(
    connectionId: string,
    payload: any,
    errorClass: string,
    errorMessage: string
): Promise<void> {
    try {
        await supabase.from('dlq_events').insert({
            connection_id: connectionId,
            payload_json: payload,
            error_message: errorMessage,
            error_class: errorClass,
            status: 'pending',
            attempt_count: 0,
            next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5min
        });

        logger.info('Event enqueued to DLQ', {
            connection_id: connectionId,
            error_class: errorClass
        });
    } catch (dlqError: any) {
        logger.error('Failed to enqueue to DLQ', {
            error: dlqError.message,
            connection_id: connectionId
        });
    }
}
