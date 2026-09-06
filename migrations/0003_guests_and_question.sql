-- Two things the Calendly flow does that the first schema did not.
--
-- Guests: a booker often brings a colleague. They go on the event as extra
-- attendees, so Google invites them too.
--
-- The question: rather than a generic notes box, each event type asks its own
-- question, and decides whether an answer is required. A recruiter call wants
-- "what is the role", a deep dive wants "what do you want to look at".

ALTER TABLE event_types ADD COLUMN question TEXT NOT NULL DEFAULT '{}';
ALTER TABLE event_types ADD COLUMN question_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_types ADD COLUMN allow_guests INTEGER NOT NULL DEFAULT 1;

ALTER TABLE bookings ADD COLUMN guests TEXT NOT NULL DEFAULT '[]';
