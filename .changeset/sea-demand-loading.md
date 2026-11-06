---
"@fluidframework/sea-driver": minor
"@fluidframework/sea-tree": minor
"@fluidframework/sea-typescript": minor
"__section": fix
"__includeInReleaseNotes": false
---
Reduce round trips and serialization during demand-driven SEA loading

Direct SharedTree loading and recovery reuse the opening snapshot/replay/live stream.
Independent summary directories load in bounded batches.
Direct SharedTree summary loading fetches each requested immutable blob only once.
Remote content requests share up to four reusable streams instead of waiting behind one in-flight response.
Requests can reuse a returned stream while a new stream is still opening, avoiding unnecessary waits for connection setup.
Unused openings finish into the pool for future requests; idle, borrowed, and opening streams share the same four-stream limit.
Failed or cancelled exchanges are discarded without retrying the request or contaminating later responses.
Recursive content prefetch remains a separate follow-up.
