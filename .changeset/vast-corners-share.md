---
"@fluidframework/presence": minor
"__section": fix
---
Attendee status fixes on reconnect

Fix "Connected" status for Attendees when local client reconnects (intermittent connection or transition from read-only to read-write connection).
This includes no longer emitting incorrect "attendeeDisconnected" events.
