---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Preserve server throttle delays across failed join-session attempts

Reconnects and session refreshes retain the server's Retry-After deadline after a join-session request fails.
New requests share a promise that waits for the deadline before fetching, without delaying unrelated documents or independently scoped client caches.
The exported promise-cache API remains unchanged.
Disposing a document service stops that caller's wait without cancelling shared work.

This change does not prevent a request that already passed its throttle check from starting if an overlapping, invalidated request subsequently establishes a new deadline.
