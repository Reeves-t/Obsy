-- Create friends table
-- NOTE: This table stores bidirectional friendships. When A adds B as a friend,
-- two rows are inserted: (A, B) and (B, A). This simplifies queries and RLS policies.
CREATE TABLE IF NOT EXISTS public.friends (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    friend_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, friend_id)
);

-- Create index for reverse lookups (checking if B is friends with A)
CREATE INDEX IF NOT EXISTS idx_friends_reverse ON public.friends(friend_id, user_id);

-- Enable RLS
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

-- Policies
-- Users can view their own friends
CREATE POLICY "Users can view their own friends" ON public.friends
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert friends (logic handled by service/function, but RLS needs to allow it)
CREATE POLICY "Users can add friends" ON public.friends
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own friends
CREATE POLICY "Users can remove friends" ON public.friends
    FOR DELETE
    USING (auth.uid() = user_id);

-- Policy for viewing friend profiles
-- Users can view profiles of people they are friends with
DROP POLICY IF EXISTS "Users can view friend profiles" ON public.profiles;
CREATE POLICY "Users can view friend profiles" ON public.profiles
    FOR SELECT
    USING (
        id IN (
            SELECT friend_id FROM public.friends WHERE user_id = auth.uid()
        )
    );
