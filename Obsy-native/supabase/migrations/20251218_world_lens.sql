-- Create world_lens_runs table
create table if not exists public.world_lens_runs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    date_key text not null, -- Format "YYYY-MM-DD"
    world_input_raw text not null,
    world_summary text,
    tone_keywords jsonb, -- Array of strings
    lenses jsonb, -- Array of lens objects { label, prompt, intent_tag }
    status text check (status in ('draft', 'active', 'completed', 'abandoned')) default 'draft',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    completed_at timestamptz,
    world_reveal_title text,
    world_reveal_text text,
    
    -- Ensure one active run per user per day logic can be handled in app or via RLS/triggers if strictness needed
    -- For now, we allow multiple rows but app logic determines the "active" one.
    constraint world_lens_runs_user_date_unique unique (user_id, date_key, created_at) -- Soft uniqueness helper
);

-- Enable RLS
alter table public.world_lens_runs enable row level security;

-- Policies for world_lens_runs
create policy "Users can view their own world lens runs"
    on public.world_lens_runs for select
    using (auth.uid() = user_id);

create policy "Users can insert their own world lens runs"
    on public.world_lens_runs for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own world lens runs"
    on public.world_lens_runs for update
    using (auth.uid() = user_id);

-- Add World Lens columns to entries (captures) table
alter table public.entries
    add column if not exists source_type text default 'regular',
    add column if not exists world_lens_run_id uuid references public.world_lens_runs(id) on delete set null,
    add column if not exists world_lens_slot_index int2,
    add column if not exists world_lens_label text,
    add column if not exists world_lens_prompt text;

-- Create index for faster lookups
create index if not exists idx_entries_world_lens_run_id on public.entries(world_lens_run_id);
create index if not exists idx_world_lens_runs_user_date on public.world_lens_runs(user_id, date_key);
