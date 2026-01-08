import { Router } from 'express';
import { supabase } from '../infra/db';
import { requireProjectAccess } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

// Overview: Counts + Lag + Connection Status
router.get('/projects/:projectId/crm/overview', requireProjectAccess({ minRole: 'viewer' }), async (req, res) => {
    const { projectId } = req.params;

    try {
        // 1. Get Counts (RPC)
        const { data: counts, error: countError } = await supabase.rpc('get_crm_object_counts', { p_project_id: projectId });
        if (countError) throw countError;

        // 2. Get Lag (RPC)
        const { data: lag, error: lagError } = await supabase.rpc('get_crm_lag_minutes', { p_project_id: projectId });
        if (lagError) throw lagError;

        // 3. Get HubSpot Connections
        const { data: connections, error: connError } = await supabase
            .from('source_connections')
            .select('id, type, name, last_success_at, last_error_at, last_error_class, is_active, config_json') // specific columns? source conn has config_json
            .eq('project_id', projectId)
            .eq('type', 'hubspot');

        if (connError) throw connError;

        // Map connections to safe view
        const safeConnections = connections.map((c: any) => ({
            id: c.id,
            type: c.type,
            name: c.name,
            last_success_at: c.last_success_at,
            last_error_at: c.last_error_at,
            status: c.is_active ? 'connected' : 'disconnected', // simplified
            has_token: !!c.config_json?.has_token
        }));

        res.json({
            counts,
            lag_minutes: lag,
            connections: safeConnections
        });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Contacts List (Read-Only, Sanitized)
router.get('/projects/:projectId/crm/contacts', requireProjectAccess({ minRole: 'viewer' }), async (req, res) => {
    const { projectId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const { data, error, count } = await supabase
        .from('crm_contacts')
        .select('id, external_id, full_name, lifecycle_stage, occurred_at, updated_at', { count: 'exact' })
        .eq('project_id', projectId)
        .order('occurred_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ data, total: count });
});

// Deals List (Read-Only)
router.get('/projects/:projectId/crm/deals', requireProjectAccess({ minRole: 'viewer' }), async (req, res) => {
    const { projectId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const { data, error, count } = await supabase
        .from('crm_deals')
        .select('id, external_id, deal_name, stage, amount, currency, occurred_at, updated_at', { count: 'exact' })
        .eq('project_id', projectId)
        .order('occurred_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ data, total: count });
});

// Manual Sync Trigger (Admin)
router.post('/projects/:projectId/crm/connections/:connectionId/sync-now', requireProjectAccess({ minRole: 'admin' }), async (req, res) => {
    const { projectId, connectionId } = req.params;

    // Verify connection exists and belongs to project
    const { count } = await supabase.from('source_connections')
        .select('*', { count: 'exact', head: true })
        .eq('id', connectionId)
        .eq('project_id', projectId);

    if (!count) return res.status(404).json({ error: 'Connection not found' });

    // Queue Sync
    const { error } = await supabase.from('sync_runs').insert({
        connection_id: connectionId,
        status: 'pending', // Worker picks this up
        started_at: new Date().toISOString(),
        stats_json: { trigger: 'manual_user_action' }
    });

    if (error) return res.status(500).json({ error: error.message });

    res.json({ success: true, message: 'Sync queued' });
});

export default router;
