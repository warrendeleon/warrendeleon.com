-- Some event types are booked through Calendly rather than written to Google
-- by this app: the News UK one-to-ones, where the organiser must be the work
-- account and only Calendly's approved client may touch that calendar. The
-- page is the same; availability and the booking itself come from Calendly,
-- and everything after the booking (invite, reschedule, cancel) is Calendly's.
ALTER TABLE event_types ADD COLUMN provider TEXT NOT NULL DEFAULT 'google' CHECK (provider IN ('google', 'calendly'));
ALTER TABLE event_types ADD COLUMN calendly_event_type TEXT;    -- Calendly event type URI
ALTER TABLE bookings ADD COLUMN provider TEXT NOT NULL DEFAULT 'google';
ALTER TABLE bookings ADD COLUMN calendly_invitee_uri TEXT;      -- the record of what was booked
