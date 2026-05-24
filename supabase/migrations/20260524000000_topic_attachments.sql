-- ─────────────────────────────────────────────────────────────────────────────
-- topic_attachments: files/photos uploaded inside a Topic
--
-- topic_id is stored as text because topics live client-side (zustand) and
-- their IDs are UUID strings generated locally — not FK-enforced server-side.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.topic_attachments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    topic_id text NOT NULL,
    file_name text NOT NULL,
    storage_path text NOT NULL UNIQUE,
    mime_type text,
    size_bytes bigint,
    kind text NOT NULL CHECK (kind IN ('document', 'image')),
    created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS topic_attachments_user_idx
    ON public.topic_attachments(user_id);
CREATE INDEX IF NOT EXISTS topic_attachments_user_topic_idx
    ON public.topic_attachments(user_id, topic_id);
CREATE INDEX IF NOT EXISTS topic_attachments_created_idx
    ON public.topic_attachments(user_id, topic_id, created_at DESC);

-- Row-level security
ALTER TABLE public.topic_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topic_attachments owner select"
    ON public.topic_attachments
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "topic_attachments owner insert"
    ON public.topic_attachments
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "topic_attachments owner update"
    ON public.topic_attachments
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "topic_attachments owner delete"
    ON public.topic_attachments
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage bucket for topic attachments. Private bucket — clients must request
-- signed URLs via createSignedUrl() to view files. Storage path convention:
--     <user_id>/<topic_id>/<attachment_id>.<ext>
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('topic-attachments', 'topic-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Object-level RLS: gated by first path segment matching auth.uid()
CREATE POLICY "topic_attachments storage insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'topic-attachments'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "topic_attachments storage select"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'topic-attachments'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "topic_attachments storage delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'topic-attachments'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
