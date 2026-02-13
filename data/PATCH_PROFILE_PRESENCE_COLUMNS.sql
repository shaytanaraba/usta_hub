-- =============================================================================
-- PATCH_PROFILE_PRESENCE_COLUMNS.sql
-- Date: 2026-02-13
-- Purpose:
--   Add profile presence columns used by web auth recovery + admin team presence:
--     - profiles.last_active_at
--     - profiles.last_seen_at
--     - profiles.is_online
--   Includes safe backfill + trigger to keep last_seen_at in sync with last_active_at.
-- =============================================================================

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN;

-- Backfill existing rows so team presence has a baseline timestamp.
UPDATE public.profiles
SET last_seen_at = COALESCE(last_seen_at, last_active_at, last_login_at)
WHERE last_seen_at IS NULL;

-- Keep last_seen_at monotonic whenever last_active_at moves.
CREATE OR REPLACE FUNCTION public.sync_profile_presence_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.last_active_at IS NOT NULL THEN
    IF NEW.last_seen_at IS NULL OR NEW.last_seen_at < NEW.last_active_at THEN
      NEW.last_seen_at := NEW.last_active_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_presence_sync ON public.profiles;
CREATE TRIGGER trg_profiles_presence_sync
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_presence_fields();

CREATE INDEX IF NOT EXISTS idx_profiles_last_active_at_desc
  ON public.profiles (last_active_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at_desc
  ON public.profiles (last_seen_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_profiles_is_online
  ON public.profiles (is_online);

COMMIT;
