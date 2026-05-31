-- Habits & Goals — durable, user-scoped storage for the Insights floating-orb
-- habit/goal tracker. The client keeps a local Zustand cache as the active UI
-- source of truth and mirrors rows here for durability + future cross-device sync.
--
-- Notes:
--   * `id` is generated client-side (expo-crypto) so create/upsert can be optimistic.
--   * `linked_topic_id` references a Topic, which currently lives only in local
--     storage, so it is an untyped uuid (no FK) to avoid coupling to a table that
--     does not exist server-side.
--   * `completion_history` is the list of completed period keys ("yyyy-MM-dd" for
--     daily, "W:yyyy-MM-dd" for weekly). Derived fields (streaks,
--     is_completed_for_current_period) are reconciled on the client after fetch.

CREATE TABLE IF NOT EXISTS public.habit_goals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type text NOT NULL CHECK (type IN ('habit', 'goal')),
    title text NOT NULL,
    frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly')),
    linked_topic_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    best_streak integer DEFAULT 0 NOT NULL,
    total_completions integer DEFAULT 0 NOT NULL,
    last_completed_at timestamp with time zone,
    completion_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_completed_for_current_period boolean DEFAULT false NOT NULL
);

-- Fast lookups by owner.
CREATE INDEX IF NOT EXISTS idx_habit_goals_user ON public.habit_goals(user_id);

-- Row Level Security — every row is private to its owner.
ALTER TABLE public.habit_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own habit goals" ON public.habit_goals
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own habit goals" ON public.habit_goals
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habit goals" ON public.habit_goals
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habit goals" ON public.habit_goals
    FOR DELETE
    USING (auth.uid() = user_id);
