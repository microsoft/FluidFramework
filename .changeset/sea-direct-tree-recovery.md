---
"@fluidframework/sea-tree": minor
"@fluidframework/sea-driver": minor
"__section": feature
"__includeInReleaseNotes": false
---
Add summaries and connection recovery to the experimental direct SEA SharedTree host

The direct host now publishes full summaries after an operation threshold or idle interval and loads summaries before replaying newer edits.
It retains application views and pending edits during connection loss, proves the old author's accepted prefix, and rebases unaccepted edits before resubmitting them.
The text-editor example exposes connection and summary status and includes browser recovery tests.
Pending edits remain in memory and do not survive closing or reloading a tab.

A failed transport close is reported without permanently blocking later reconnect attempts.
