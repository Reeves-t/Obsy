-- Create the voice-notes storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own voice notes
CREATE POLICY "Users can upload their own voice notes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'voice-notes'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own voice notes
CREATE POLICY "Users can read their own voice notes"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'voice-notes'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read (so transcription edge function can fetch via public URL)
CREATE POLICY "Public read for voice notes"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'voice-notes');
