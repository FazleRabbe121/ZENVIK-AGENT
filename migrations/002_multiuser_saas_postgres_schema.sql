-- ZENVIK-AGENT Multi-User SaaS PostgreSQL / Supabase Migration
-- Migration: 002_multiuser_saas_postgres_schema.sql
-- Purpose: Production-ready multi-user relational schema with strict per-user RLS policies,
-- encrypted OAuth token storage, CV ownership isolation, job search preferences, and audit logs.
-- Compatible with PostgreSQL 15+ and Supabase.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Multi-User Accounts
CREATE TABLE IF NOT EXISTS public.zenvik_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email' CHECK (auth_provider IN ('email', 'google', 'firebase')),
  firebase_uid TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  default_email_subject TEXT NOT NULL DEFAULT '',
  default_cover_letter TEXT NOT NULL DEFAULT '',
  daily_send_limit INTEGER NOT NULL DEFAULT 40 CHECK (daily_send_limit BETWEEN 1 AND 250),
  min_delay_seconds INTEGER NOT NULL DEFAULT 45 CHECK (min_delay_seconds BETWEEN 10 AND 600),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zenvik_users_email_lower ON public.zenvik_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_zenvik_users_status ON public.zenvik_users (status);

-- 2. User Profiles & Setup Wizard State
CREATE TABLE IF NOT EXISTS public.zenvik_user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES public.zenvik_users (user_id) ON DELETE CASCADE,
  headline TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  nationality TEXT NOT NULL DEFAULT '',
  current_country TEXT NOT NULL DEFAULT '',
  setup_wizard_completed BOOLEAN NOT NULL DEFAULT FALSE,
  setup_completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. User Job Search Preferences
CREATE TABLE IF NOT EXISTS public.zenvik_job_preferences (
  user_id TEXT PRIMARY KEY REFERENCES public.zenvik_users (user_id) ON DELETE CASCADE,
  preferred_countries JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_cities JSONB NOT NULL DEFAULT '[]'::jsonb,
  job_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  employment_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  sponsorship_required BOOLEAN NOT NULL DEFAULT TRUE,
  relocation_support BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Personal Gmail OAuth 2.0 Connections (AES-256-GCM Encrypted Tokens Only)
CREATE TABLE IF NOT EXISTS public.zenvik_gmail_connections (
  user_id TEXT PRIMARY KEY REFERENCES public.zenvik_users (user_id) ON DELETE CASCADE,
  gmail_address TEXT NOT NULL,
  scopes JSONB NOT NULL DEFAULT '["https://www.googleapis.com/auth/gmail.send"]'::jsonb,
  encrypted_access_token JSONB,
  encrypted_refresh_token JSONB,
  access_token_expires_at BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'expired', 'revoked', 'disconnected')),
  last_error TEXT,
  sent_today_count INTEGER NOT NULL DEFAULT 0,
  daily_quota_date DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_limit INTEGER NOT NULL DEFAULT 40,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zenvik_gmail_status ON public.zenvik_gmail_connections (status);

-- 5. User-Isolated CV Documents (CV Gallery Single Source of Truth)
CREATE TABLE IF NOT EXISTS public.zenvik_cv_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.zenvik_users (user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_role TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT,
  content_sha256 TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zenvik_cv_documents_user ON public.zenvik_cv_documents (user_id, is_default DESC, updated_at DESC);

-- 6. User-Isolated Saved Jobs
CREATE TABLE IF NOT EXISTS public.zenvik_saved_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.zenvik_users (user_id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  employer TEXT NOT NULL,
  title TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  application_url TEXT NOT NULL DEFAULT '',
  recipient_email TEXT,
  sponsorship_status TEXT NOT NULL DEFAULT 'unverified',
  verification_status TEXT NOT NULL DEFAULT 'verified',
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_zenvik_saved_jobs_user ON public.zenvik_saved_jobs (user_id, saved_at DESC);

-- 7. User-Isolated Job Applications
CREATE TABLE IF NOT EXISTS public.zenvik_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.zenvik_users (user_id) ON DELETE CASCADE,
  job_id TEXT,
  company TEXT NOT NULL,
  position TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  cover_letter TEXT NOT NULL,
  cv_id TEXT,
  cv_title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sending', 'sent', 'failed')),
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  sender_gmail TEXT,
  error_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_zenvik_applications_user_status ON public.zenvik_applications (user_id, status, created_at DESC);

-- 8. User-Isolated Email Delivery History & Deduplication Log
CREATE TABLE IF NOT EXISTS public.zenvik_email_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.zenvik_users (user_id) ON DELETE CASCADE,
  application_id TEXT REFERENCES public.zenvik_applications (id) ON DELETE SET NULL,
  dedup_key TEXT NOT NULL,
  sender_gmail TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  company TEXT,
  position TEXT,
  subject TEXT NOT NULL,
  cover_letter_snippet TEXT NOT NULL DEFAULT '',
  cv_id TEXT NOT NULL,
  cv_filename TEXT NOT NULL,
  cv_content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  http_status INTEGER,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  error_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zenvik_email_history_user_dedup ON public.zenvik_email_history (user_id, dedup_key);
CREATE INDEX IF NOT EXISTS idx_zenvik_email_history_user_time ON public.zenvik_email_history (user_id, created_at DESC);

-- 9. AI Generation History (Per-User)
CREATE TABLE IF NOT EXISTS public.zenvik_ai_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.zenvik_users (user_id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('Gemini', 'OpenAI', 'Grok', 'DeterministicFallback')),
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  prompt_summary TEXT NOT NULL,
  response_summary TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'fallback', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zenvik_ai_history_user ON public.zenvik_ai_history (user_id, created_at DESC);

-- 10. Per-User Notifications
CREATE TABLE IF NOT EXISTS public.zenvik_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.zenvik_users (user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zenvik_notifications_user ON public.zenvik_notifications (user_id, read, created_at DESC);

-- 11. System & Security Audit Logs (Admin-Only)
CREATE TABLE IF NOT EXISTS public.zenvik_system_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'security')),
  category TEXT NOT NULL,
  actor_user_id TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zenvik_system_logs_time ON public.zenvik_system_logs (created_at DESC);

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES — STRICT PER-USER DATA ISOLATION
-- ============================================================================

ALTER TABLE public.zenvik_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_job_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_gmail_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_cv_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_email_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_ai_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zenvik_system_logs ENABLE ROW LEVEL SECURITY;

-- Note: When accessed via Supabase Auth JWT (auth.uid()), each user can ONLY read/write their own rows.
-- Server-side Express backend uses service role or parameterized user_id derived strictly from verified JWTs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE POLICY IF NOT EXISTS zenvik_users_self_access ON public.zenvik_users
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

    CREATE POLICY IF NOT EXISTS zenvik_profiles_self_access ON public.zenvik_user_profiles
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

    CREATE POLICY IF NOT EXISTS zenvik_prefs_self_access ON public.zenvik_job_preferences
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

    CREATE POLICY IF NOT EXISTS zenvik_gmail_self_access ON public.zenvik_gmail_connections
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

    CREATE POLICY IF NOT EXISTS zenvik_cv_self_access ON public.zenvik_cv_documents
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

    CREATE POLICY IF NOT EXISTS zenvik_saved_jobs_self_access ON public.zenvik_saved_jobs
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

    CREATE POLICY IF NOT EXISTS zenvik_apps_self_access ON public.zenvik_applications
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

    CREATE POLICY IF NOT EXISTS zenvik_email_history_self_access ON public.zenvik_email_history
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

    CREATE POLICY IF NOT EXISTS zenvik_ai_history_self_access ON public.zenvik_ai_history
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);

    CREATE POLICY IF NOT EXISTS zenvik_notifications_self_access ON public.zenvik_notifications
      FOR ALL USING (user_id = auth.uid()::text) WITH CHECK (user_id = auth.uid()::text);
  END IF;
END $$;
