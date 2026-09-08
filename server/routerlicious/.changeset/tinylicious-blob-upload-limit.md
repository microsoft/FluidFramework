---
"tinylicious": minor
"__section": fix
---

Bound Tinylicious blob upload concurrency

Tinylicious now limits the number of simultaneous blob uploads issued to its in-process Historian endpoint. This prevents concurrent summaries from creating thousands of localhost HTTP requests and sockets at once, which could delay unrelated requests and cause test timeouts.
