-- Rename world_reveal_text to world_reveal_body for clarity
ALTER TABLE public.world_lens_runs 
  RENAME COLUMN world_reveal_text TO world_reveal_body;

-- Add closing reflection field
ALTER TABLE public.world_lens_runs 
  ADD COLUMN IF NOT EXISTS world_reveal_reflection text;

