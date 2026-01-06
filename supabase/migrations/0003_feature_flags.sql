-- Migration: 0003_feature_flags.sql
-- Description: Core table for multi-tenant feature flags.

-- 1. Table definition
CREATE TABLE IF NOT EXISTS public.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(org_id, key)
);

-- 2. Indices
CREATE INDEX idx_feature_flags_org_key ON public.feature_flags(org_id, key);

-- 3. RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view feature flags for their organization"
    ON public.feature_flags
    FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM public.org_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Admins can manage feature flags"
    ON public.feature_flags
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.org_members 
            WHERE user_id = auth.uid() 
            AND org_id = feature_flags.org_id
            AND role IN ('admin', 'owner')
        )
    );

-- 4. Initial Global Flags (Placeholder Example)
-- Note: These would usually be inserted per-tenant, but we can seed some defaults if needed.
-- For now, we leave it empty for the backend/frontend to handle fallbacks.

-- 5. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER tr_feature_flags_updated_at
    BEFORE UPDATE ON public.feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
