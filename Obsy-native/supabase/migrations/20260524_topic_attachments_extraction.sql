-- ─────────────────────────────────────────────────────────────────────────────
-- topic_attachments: add fields for AI content extraction
--
-- Extraction pipeline:
--   1. User uploads file → row inserted with extraction_status = 'pending'
--   2. Edge function (extract-attachment) reads from storage, sends to Claude
--   3. Row updated with extracted_text + extraction_status = 'done'/'failed'/'skipped'
--
-- Cached extracted_text is reused by topic AI features (Insight, Gaps, Ask Obsy)
-- so the user only pays the Claude extraction cost once per file.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.topic_attachments
    ADD COLUMN IF NOT EXISTS extracted_text text,
    ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS extraction_error text,
    ADD COLUMN IF NOT EXISTS extracted_at timestamptz;

-- Lock down extraction_status to known values.
ALTER TABLE public.topic_attachments
    DROP CONSTRAINT IF EXISTS topic_attachments_extraction_status_check;

ALTER TABLE public.topic_attachments
    ADD CONSTRAINT topic_attachments_extraction_status_check
    CHECK (extraction_status IN ('pending', 'processing', 'done', 'failed', 'skipped'));

CREATE INDEX IF NOT EXISTS topic_attachments_extraction_status_idx
    ON public.topic_attachments(extraction_status)
    WHERE extraction_status IN ('pending', 'processing');
