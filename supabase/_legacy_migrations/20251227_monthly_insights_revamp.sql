-- Monthly Insights Revamp Migration
-- Creates tables for daily mood flows and monthly mood summaries

-- =============================================================================
-- 1. DAILY_MOOD_FLOWS TABLE
-- Stores aggregated mood flow data for each day, updated on every capture
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.daily_mood_flows (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date_key text NOT NULL,
    segments jsonb NOT NULL,
    dominant text NOT NULL,
    total_captures int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT daily_mood_flows_user_date_unique UNIQUE(user_id, date_key)
);

-- Index for efficient date range queries
CREATE INDEX IF NOT EXISTS idx_daily_mood_flows_user_date ON public.daily_mood_flows(user_id, date_key);

-- Enable RLS
ALTER TABLE public.daily_mood_flows ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily_mood_flows
DROP POLICY IF EXISTS "daily_mood_flows_select" ON public.daily_mood_flows;
CREATE POLICY "daily_mood_flows_select" ON public.daily_mood_flows
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_mood_flows_insert" ON public.daily_mood_flows;
CREATE POLICY "daily_mood_flows_insert" ON public.daily_mood_flows
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_mood_flows_update" ON public.daily_mood_flows;
CREATE POLICY "daily_mood_flows_update" ON public.daily_mood_flows
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_mood_flows_delete" ON public.daily_mood_flows;
CREATE POLICY "daily_mood_flows_delete" ON public.daily_mood_flows
    FOR DELETE
    USING (auth.uid() = user_id);

-- =============================================================================
-- 2. MONTHLY_MOOD_SUMMARIES TABLE
-- Stores cached monthly summaries with AI-generated narratives
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.monthly_mood_summaries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    month_key text NOT NULL,
    mood_totals jsonb NOT NULL,
    ai_summary text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT monthly_mood_summaries_user_month_unique UNIQUE(user_id, month_key)
);

-- Index for efficient month queries
CREATE INDEX IF NOT EXISTS idx_monthly_summaries_user_month ON public.monthly_mood_summaries(user_id, month_key);

-- Enable RLS
ALTER TABLE public.monthly_mood_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for monthly_mood_summaries
DROP POLICY IF EXISTS "monthly_mood_summaries_select" ON public.monthly_mood_summaries;
CREATE POLICY "monthly_mood_summaries_select" ON public.monthly_mood_summaries
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "monthly_mood_summaries_insert" ON public.monthly_mood_summaries;
CREATE POLICY "monthly_mood_summaries_insert" ON public.monthly_mood_summaries
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "monthly_mood_summaries_update" ON public.monthly_mood_summaries;
CREATE POLICY "monthly_mood_summaries_update" ON public.monthly_mood_summaries
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "monthly_mood_summaries_delete" ON public.monthly_mood_summaries;
CREATE POLICY "monthly_mood_summaries_delete" ON public.monthly_mood_summaries
    FOR DELETE
    USING (auth.uid() = user_id);

