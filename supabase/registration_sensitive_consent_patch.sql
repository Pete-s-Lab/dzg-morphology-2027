alter table public.registrations
  add column if not exists sensitive_data_consent boolean not null default false;

alter table public.registrations
  add column if not exists sensitive_data_consent_at timestamptz;
