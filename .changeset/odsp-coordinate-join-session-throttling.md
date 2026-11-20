---
"@fluidframework/odsp-driver": minor
"__section": fix
---
Avoid repeated session requests before a server throttle delay expires

After a session request received HTTP 429 (Too Many Requests), subsequent connection attempts or session refreshes could send another request before the server's requested delay expired.
These early requests could trigger further throttling and delay connection recovery.
With the driver's default cache, subsequent attempts for the same document wait for the remaining `Retry-After` delay and share a session request.
Other documents and clients with separate caches are not delayed.

Applications that supply a plain `PromiseCache` instead of the driver's default cache retain their previous behavior.
Requests already in progress when another request receives a throttle response are not delayed by this fix.
