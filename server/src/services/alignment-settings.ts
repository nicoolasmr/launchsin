/**
 * Alignment Settings Service
 * 
 * Manages per-project configuration for alignment intelligence operations
 */

import { supabase } from '../infra/db';
import { logger } from '../utils/logger';

export interface AlignmentSettings {
    id: string;
    org_id: string;
    project_id: string;
    enabled: boolean;
    cadence: 'daily' | 'weekly';
    max_checks_per_day: number;
    min_score_alert_threshold: number;
    quiet_hours_json?: {
        start: string;
        end: string;
        timezone: string;
    };
    created_at: string;
    updated_at: string;
}

export interface AlignmentSettingsUpdate {
    enabled?: boolean;
    cadence?: 'daily' | 'weekly';
    max_checks_per_day?: number;
    min_score_alert_threshold?: number;
    quiet_hours_json?: {
        start: string;
        end: string;
        timezone: string;
    };
}

export class AlignmentSettingsService {
    /**
     * Get alignment settings for a project
     */
    async getSettings(projectId: string): Promise<AlignmentSettings | null> {
        const { data, error } = await supabase
            .from('alignment_settings')
            .select('*')
            .eq('project_id', projectId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No settings found, return default
                return null;
            }
            logger.error('Failed to get alignment settings', { error, projectId });
            throw error;
        }

        return data;
    }

    /**
     * Get or create default settings for a project
     */
    async getOrCreateSettings(
        projectId: string,
        orgId: string
    ): Promise<AlignmentSettings> {
        const existing = await this.getSettings(projectId);
        if (existing) return existing;

        // Create default settings
        const { data, error } = await supabase
            .from('alignment_settings')
            .insert({
                org_id: orgId,
                project_id: projectId,
                enabled: false,
                cadence: 'weekly',
                max_checks_per_day: 50,
                min_score_alert_threshold: 70
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create alignment settings', { error, projectId });
            throw error;
        }

        return data;
    }

    /**
     * Update alignment settings
     */
    async updateSettings(
        projectId: string,
        updates: AlignmentSettingsUpdate
    ): Promise<AlignmentSettings> {
        const { data, error } = await supabase
            .from('alignment_settings')
            .update(updates)
            .eq('project_id', projectId)
            .select()
            .single();

        if (error) {
            logger.error('Failed to update alignment settings', { error, projectId });
            throw error;
        }

        logger.info('Alignment settings updated', { projectId, updates });
        return data;
    }

    /**
     * Check if alignment is enabled for a project
     */
    async isEnabled(projectId: string): Promise<boolean> {
        const settings = await this.getSettings(projectId);
        return settings?.enabled || false;
    }

    /**
     * Check if we're within quiet hours
     */
    async isQuietHours(projectId: string): Promise<boolean> {
        const settings = await this.getSettings(projectId);
        if (!settings?.quiet_hours_json) return false;

        const { start, end, timezone } = settings.quiet_hours_json;
        const now = new Date();

        // Simple time comparison (can be enhanced with timezone support)
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

        return currentTime >= start && currentTime <= end;
    }

    /**
     * Get today's check count for a project
     */
    async getTodayCheckCount(projectId: string): Promise<number> {
        const { count, error } = await supabase
            .from('alignment_runs')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .gte('started_at', new Date().toISOString().split('T')[0]); // Today

        if (error) {
            logger.error('Failed to get today check count', { error, projectId });
            return 0;
        }

        return count || 0;
    }

    /**
     * Check if we can run more checks today (budget check)
     */
    async canRunCheck(projectId: string): Promise<{ allowed: boolean; reason?: string }> {
        const settings = await this.getSettings(projectId);
        if (!settings) {
            return { allowed: false, reason: 'Alignment not configured' };
        }

        if (!settings.enabled) {
            return { allowed: false, reason: 'Alignment is disabled' };
        }

        if (await this.isQuietHours(projectId)) {
            return { allowed: false, reason: 'Within quiet hours' };
        }

        const todayCount = await this.getTodayCheckCount(projectId);
        if (todayCount >= settings.max_checks_per_day) {
            return {
                allowed: false,
                reason: `Daily budget exceeded (${todayCount}/${settings.max_checks_per_day})`
            };
        }

        return { allowed: true };
    }
}

export const alignmentSettingsService = new AlignmentSettingsService();
