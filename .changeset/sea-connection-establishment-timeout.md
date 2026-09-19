---
"__section": fix
"__includeInReleaseNotes": false
---
Keep the experimental Sea listener available after failed connection attempts

The WebTransport server bounds connection establishment with one operation deadline.
Failed, rejected, and timed-out handshakes release connection capacity without stopping the listener.
Established-session I/O and inactivity policies are unchanged.