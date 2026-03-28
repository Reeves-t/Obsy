-- Make photo_path nullable so journal and voice entries (which have no photo)
-- can be inserted without violating the NOT NULL constraint.
-- The app code now sends '' as a fallback, but this migration allows NULL
-- as the semantically correct value for photo-less entries.
ALTER TABLE entries ALTER COLUMN photo_path DROP NOT NULL;
