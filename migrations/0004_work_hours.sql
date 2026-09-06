-- Warren's availability, 2026-09-06: Monday to Friday, 09:00 to 12:00 and
-- 13:30 to 17:30, Europe/London. Two windows a day, so lunch is never offered.
UPDATE schedules
   SET weekly_hours = '{"1":[["09:00","12:00"],["13:30","17:30"]],"2":[["09:00","12:00"],["13:30","17:30"]],"3":[["09:00","12:00"],["13:30","17:30"]],"4":[["09:00","12:00"],["13:30","17:30"]],"5":[["09:00","12:00"],["13:30","17:30"]]}',
       name = 'Weekdays, 9 to 12 and 1:30 to 5:30',
       updated_at = datetime('now')
 WHERE id = 'work-hours';
