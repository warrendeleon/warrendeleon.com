-- Booking system, initial schema.
-- Applied with: npx wrangler d1 migrations apply warrendeleon-booking [--remote]

PRAGMA foreign_keys = ON;

-- One row per Google account that has granted consent through the admin site.
CREATE TABLE IF NOT EXISTS calendar_accounts (
  email             TEXT PRIMARY KEY,            -- taken from the id_token at connect time
  refresh_token_enc TEXT NOT NULL,               -- AES-GCM under TOKEN_KEY, iv prefixed
  check_busy        INTEGER NOT NULL DEFAULT 1,  -- include this calendar in freebusy
  status            TEXT NOT NULL DEFAULT 'ok'
                    CHECK (status IN ('ok', 'needs_reconnect')),
  last_error        TEXT,
  connected_at      TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- Named availability schedules. An event type points at one; free/busy is then
-- subtracted from whatever the schedule allows.
CREATE TABLE IF NOT EXISTS schedules (
  id             TEXT PRIMARY KEY,               -- 'work-hours', 'evenings'
  name           TEXT NOT NULL,
  timezone       TEXT NOT NULL DEFAULT 'Europe/London',
  weekly_hours   TEXT NOT NULL DEFAULT '{}',     -- {"1":[["09:00","17:00"]], ...} ISO weekday
  date_overrides TEXT NOT NULL DEFAULT '{}',     -- {"2026-12-25":[]} empty list blocks the day
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_types (
  slug              TEXT PRIMARY KEY,
  duration_minutes  INTEGER NOT NULL CHECK (duration_minutes % 30 = 0 AND duration_minutes > 0),
  names             TEXT NOT NULL,               -- {"en":"…","es":"…","ca":"…","tl":"…"}
  descriptions      TEXT NOT NULL,
  locations         TEXT NOT NULL DEFAULT '["video","phone"]',
  organiser_account TEXT NOT NULL REFERENCES calendar_accounts(email),
  mirror_to         TEXT NOT NULL DEFAULT '[]',  -- other connected addresses to invite
  schedule_id       TEXT NOT NULL REFERENCES schedules(id),
  buffer_minutes    INTEGER NOT NULL DEFAULT 15  CHECK (buffer_minutes >= 0),
  min_notice_hours  INTEGER NOT NULL DEFAULT 24  CHECK (min_notice_hours >= 0),
  days_ahead_limit  INTEGER NOT NULL DEFAULT 30  CHECK (days_ahead_limit > 0),
  max_per_day       INTEGER NOT NULL DEFAULT 5   CHECK (max_per_day > 0),
  visibility        TEXT NOT NULL DEFAULT 'listed'
                    CHECK (visibility IN ('listed', 'unlisted')),
  active            INTEGER NOT NULL DEFAULT 1,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id                TEXT PRIMARY KEY,            -- crypto.randomUUID()
  event_type        TEXT NOT NULL,
  organiser_account TEXT NOT NULL,               -- frozen here: cancel and reschedule need the same token
  start_utc         TEXT NOT NULL,               -- ISO 8601 UTC instant
  end_utc           TEXT NOT NULL,
  local_date        TEXT NOT NULL,               -- YYYY-MM-DD in the schedule's zone, for the daily cap
  location          TEXT NOT NULL CHECK (location IN ('video', 'phone')),
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,                        -- E.164, required for phone calls
  booker_timezone   TEXT NOT NULL,
  notes             TEXT,
  utm_source        TEXT,
  utm_medium        TEXT,
  utm_campaign      TEXT,
  utm_content       TEXT,
  google_event_id   TEXT,
  meet_link         TEXT,
  manage_token      TEXT NOT NULL,               -- 128-bit random hex, the capability to cancel
  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'cancelled')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (end_utc > start_utc),
  CHECK (location = 'video' OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_bookings_day
  ON bookings (local_date) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS idx_bookings_start
  ON bookings (start_utc) WHERE status = 'confirmed';

-- One row per 30-minute bucket a confirmed booking covers. Inserted in the same
-- atomic batch as the booking, so two overlapping requests collide on the
-- primary key and the loser is rejected. This is what replaces the serialised
-- writes a Durable Object would have given us.
CREATE TABLE IF NOT EXISTS slot_locks (
  bucket_utc TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,                 -- 'email:<addr>' | 'ip:<addr>'
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT,
  action     TEXT NOT NULL
             CHECK (action IN ('created', 'cancelled', 'rescheduled', 'failed', 'connected', 'disconnected')),
  details    TEXT NOT NULL DEFAULT '{}',         -- JSON; never raw email or phone
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);

-- Two schedules to start from. Event types are seeded through the admin once a
-- Google account has been connected, because organiser_account references one.
INSERT OR IGNORE INTO schedules (id, name, timezone, weekly_hours, date_overrides, updated_at)
VALUES
  ('work-hours', 'Work hours', 'Europe/London',
   '{"1":[["09:00","17:00"]],"2":[["09:00","17:00"]],"3":[["09:00","17:00"]],"4":[["09:00","17:00"]],"5":[["09:00","17:00"]]}',
   '{}', datetime('now')),
  ('evenings', 'Evenings and weekends', 'Europe/London',
   '{"1":[["18:00","21:00"]],"2":[["18:00","21:00"]],"3":[["18:00","21:00"]],"4":[["18:00","21:00"]],"5":[["18:00","21:00"]],"6":[["10:00","16:00"]]}',
   '{}', datetime('now'));
