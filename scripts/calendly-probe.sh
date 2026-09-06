#!/usr/bin/env bash
# Find out what a free Calendly plan actually allows, before paying for it.
#
# Create a personal access token first at https://calendly.com/integrations/api_webhooks
# then run this and paste it when asked. The token is read into a variable and
# never appears in an argument, so it stays out of ps output and shell history.

set -uo pipefail
API=https://api.calendly.com

read -rsp "Calendly personal access token: " TOKEN
echo

call() { curl -s -o /tmp/cal.$$ -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$1"; }
show() { printf '%-34s %s\n' "$1" "$2"; }

CODE=$(call "$API/users/me")
show "GET /users/me" "$CODE"
if [ "$CODE" != "200" ]; then
  echo "  -> token rejected; nothing else will work."
  head -c 300 /tmp/cal.$$; echo; /bin/rm -f /tmp/cal.$$; exit 1
fi

USER_URI=$(sed -n 's/.*"uri":"\([^"]*users[^"]*\)".*/\1/p' /tmp/cal.$$ | head -1)
ORG_URI=$(sed -n 's/.*"current_organization":"\([^"]*\)".*/\1/p' /tmp/cal.$$ | head -1)
show "  user" "${USER_URI:-not found}"

CODE=$(call "$API/event_types?user=$USER_URI")
show "GET /event_types" "$CODE"
EVENT_URI=$(sed -n 's/.*"uri":"\(https:[^"]*event_types[^"]*\)".*/\1/p' /tmp/cal.$$ | head -1)
COUNT=$(grep -o '"uri":"https[^"]*event_types' /tmp/cal.$$ | wc -l | tr -d ' ')
show "  active event types" "$COUNT"

# The endpoint the booking UI depends on. Seven days from tomorrow, because
# start_time must be in the future.
START=$(date -u -v+1d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '+1 day' '+%Y-%m-%dT%H:%M:%SZ')
END=$(date -u -v+8d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '+8 days' '+%Y-%m-%dT%H:%M:%SZ')
if [ -n "${EVENT_URI:-}" ]; then
  CODE=$(call "$API/event_type_available_times?event_type=$EVENT_URI&start_time=$START&end_time=$END")
  show "GET /event_type_available_times" "$CODE"
  SLOTS=$(grep -o '"start_time"' /tmp/cal.$$ | wc -l | tr -d ' ')
  show "  slots returned (7 days)" "$SLOTS"
  [ "$CODE" != "200" ] && { echo "  -> body:"; head -c 400 /tmp/cal.$$; echo; }

  # Same call over 31 days, to settle whether the window is 7 days or 31.
  LONG=$(date -u -v+32d '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '+32 days' '+%Y-%m-%dT%H:%M:%SZ')
  CODE=$(call "$API/event_type_available_times?event_type=$EVENT_URI&start_time=$START&end_time=$LONG")
  show "  same call over 31 days" "$CODE"
  [ "$CODE" != "200" ] && { printf '  -> '; sed -n 's/.*"message":"\([^"]*\)".*/\1/p' /tmp/cal.$$ | head -1; }
fi

CODE=$(call "$API/scheduled_events?organization=$ORG_URI")
show "GET /scheduled_events" "$CODE"

echo
echo "Booking itself (POST /scheduling/event_invitees) is not called here:"
echo "it would create a real meeting. A 403 on the reads above means free is"
echo "too restricted; 200s mean you can build the whole browsing half unpaid."
/bin/rm -f /tmp/cal.$$
