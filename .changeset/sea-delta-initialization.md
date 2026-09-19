---
"@fluidframework/sea-driver": minor
"__section": fix
"__includeInReleaseNotes": false
---
Serialize overlapping SEA delta connection initialization

Overlapping delta connections now finish membership, signal, and subscription setup before another connection replaces the shared session.
This prevents reconnect failures reporting `signal stream is already open on this connection`.
