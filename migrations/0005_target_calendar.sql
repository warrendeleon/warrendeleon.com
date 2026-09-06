-- Where a booking's event is written. Public bookings go on the Interviews
-- calendar rather than the primary one, so the diary stays readable.
ALTER TABLE event_types ADD COLUMN target_calendar_id TEXT NOT NULL DEFAULT 'primary';
-- Remembered per booking, so cancel and reschedule address the right calendar
-- even if the event type is later pointed elsewhere.
ALTER TABLE bookings ADD COLUMN google_calendar_id TEXT;
