-- Google push channels, one per calendar the bookings are written to. The
-- reconcile runs when Google calls the webhook and on a timer as a fallback,
-- so a booking deleted or moved by hand in the calendar reaches its row.
CREATE TABLE IF NOT EXISTS sync_channels (
  calendar_id TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  token       TEXT NOT NULL,                     -- echoed by Google in X-Goog-Channel-Token
  expires_at  TEXT NOT NULL,                     -- ISO 8601 UTC
  updated_at  TEXT NOT NULL
);
