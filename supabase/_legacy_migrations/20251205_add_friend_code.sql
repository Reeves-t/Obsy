-- Friend Code System
-- Friend codes are unique, case-insensitive 8-character identifiers used to add friends.
-- They use only uppercase letters (excluding I, O) and digits (excluding 0, 1) to avoid confusion.

-- Create function to generate unique friend code (with safety limit and validation)
CREATE OR REPLACE FUNCTION public.generate_friend_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
    -- Characters: A-Z (excluding I, O) and 2-9 (excluding 0, 1) to avoid confusion
    chars text[] := '{A,B,C,D,E,F,G,H,J,K,L,M,N,P,Q,R,S,T,U,V,W,X,Y,Z,2,3,4,5,6,7,8,9}';
    result text := '';
    i integer := 0;
    code_exists boolean;
    attempts integer := 0;
    max_attempts integer := 100;
BEGIN
    LOOP
        attempts := attempts + 1;
        IF attempts > max_attempts THEN
            RAISE EXCEPTION 'Could not generate unique friend code after % attempts. This may indicate a database issue.', max_attempts
                USING HINT = 'Check the profiles table for duplicate or invalid friend codes.';
        END IF;

        result := '';
        FOR i IN 1..8 LOOP
            result := result || chars[1+floor(random()*array_length(chars, 1))];
        END LOOP;

        -- Ensure result is uppercase (defensive)
        result := UPPER(result);

        SELECT EXISTS(SELECT 1 FROM public.profiles WHERE friend_code = result) INTO code_exists;
        EXIT WHEN NOT code_exists;
    END LOOP;

    RETURN result;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION public.generate_friend_code() IS
'Generates a unique 8-character friend code using uppercase letters (A-Z excluding I,O) and digits (2-9). Used for adding friends without sharing personal info.';

-- Add friend_code column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'friend_code') THEN
        ALTER TABLE public.profiles ADD COLUMN friend_code text UNIQUE;
    END IF;
END $$;

-- Backfill existing profiles that have no friend_code
UPDATE public.profiles
SET friend_code = generate_friend_code()
WHERE friend_code IS NULL;

-- Make it NOT NULL and set DEFAULT for future rows
ALTER TABLE public.profiles
ALTER COLUMN friend_code SET DEFAULT generate_friend_code(),
ALTER COLUMN friend_code SET NOT NULL;

-- Add CHECK constraint to ensure friend_code format (8 uppercase alphanumeric characters)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'profiles' AND constraint_name = 'friend_code_format_check'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT friend_code_format_check
        CHECK (friend_code ~ '^[A-Z0-9]{8}$');
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        NULL; -- Constraint already exists
END $$;

-- Create index on friend_code for faster lookups (used frequently in friend searches)
CREATE INDEX IF NOT EXISTS idx_profiles_friend_code ON public.profiles(friend_code);
