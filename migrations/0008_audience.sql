-- Which list a type appears on: the public /booking/ page or the work
-- /booking/work/ page for colleagues. Unlisted types appear on neither.
ALTER TABLE event_types ADD COLUMN audience TEXT NOT NULL DEFAULT 'public' CHECK (audience IN ('public', 'work'));
UPDATE event_types SET audience = 'work', visibility = 'listed' WHERE provider = 'calendly';
