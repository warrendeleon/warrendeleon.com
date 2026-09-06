-- A connected account can contribute more than its own primary calendar.
--
-- A calendar shared into an account at free/busy level shows up in that
-- account's calendar list under the sharer's address, and can be queried in the
-- same freebusy call. That is how the News UK diary blocks slots without the
-- app ever being granted access to the News UK account: an ordinary calendar
-- share, not an OAuth grant.

ALTER TABLE calendar_accounts
  ADD COLUMN calendar_ids TEXT NOT NULL DEFAULT '["primary"]';
