-- OBS-10 (audit OBS-7): ensure RLS + owner policies on the topic tables.
--
-- topics / topic_attachments were created outside source control, so RLS state
-- was unverifiable. These are strictly owner-scoped (no cross-user reads), so
-- enabling RLS with owner-only policies is low-risk. Guarded so the migration is
-- safe whether or not the tables exist and only applies when a `user_id`
-- ownership column is present (user_id confirmed in services/topicAttachments.ts).
--
-- NOTE: the over-broad `profiles` SELECT USING(true) restriction is intentionally
-- NOT included here — it has broad blast radius across the friends/invite/albums
-- cross-user reads and is tracked as a separate, integration-tested follow-up.

DO $$
BEGIN
  IF to_regclass('public.topics') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'topics' AND column_name = 'user_id'
     ) THEN
    EXECUTE 'ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Topics select by owner" ON public.topics';
    EXECUTE 'CREATE POLICY "Topics select by owner" ON public.topics FOR SELECT TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "Topics insert by owner" ON public.topics';
    EXECUTE 'CREATE POLICY "Topics insert by owner" ON public.topics FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "Topics update by owner" ON public.topics';
    EXECUTE 'CREATE POLICY "Topics update by owner" ON public.topics FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "Topics delete by owner" ON public.topics';
    EXECUTE 'CREATE POLICY "Topics delete by owner" ON public.topics FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.topic_attachments') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'topic_attachments' AND column_name = 'user_id'
     ) THEN
    EXECUTE 'ALTER TABLE public.topic_attachments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Topic attachments select by owner" ON public.topic_attachments';
    EXECUTE 'CREATE POLICY "Topic attachments select by owner" ON public.topic_attachments FOR SELECT TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "Topic attachments insert by owner" ON public.topic_attachments';
    EXECUTE 'CREATE POLICY "Topic attachments insert by owner" ON public.topic_attachments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "Topic attachments update by owner" ON public.topic_attachments';
    EXECUTE 'CREATE POLICY "Topic attachments update by owner" ON public.topic_attachments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS "Topic attachments delete by owner" ON public.topic_attachments';
    EXECUTE 'CREATE POLICY "Topic attachments delete by owner" ON public.topic_attachments FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;
