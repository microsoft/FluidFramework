---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Honor server throttle delays across join-session callers

Join-session requests for the same document and client cache honor the longest active Retry-After deadline, including after an earlier request fails.
Reconnects and session refreshes share this gate without blocking unrelated documents or independently scoped clients.
Disposing a document service cancels its throttle waits.
