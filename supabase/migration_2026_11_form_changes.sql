-- Apply ONLY after deleting all registration and abstract rows.
-- Drops discontinued form fields; preserves schema, grants, and existing policies.
ALTER TABLE public.abstracts ADD COLUMN IF NOT EXISTS invited_speaker_contest boolean NOT NULL DEFAULT false;
ALTER TABLE public.abstracts DROP COLUMN IF EXISTS corresponding_author;
ALTER TABLE public.registrations DROP COLUMN IF EXISTS dietary_requirements;
-- Retain accessibility_requirements and sensitive_data_consent for explicit GDPR consent.
