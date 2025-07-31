---
"@fluidframework/server-lambdas": minor
"__section": feature
---
Added "Pre-connect TTL" to Websocket Server Configuration

A pre-connect TTL was added to the websocket server such that a socket connection will be severed if no "connect_document" attempt is successful within the allowed time limit. This keeps the service from maintaining stale or unused socket connections.

The default pre-connect TTL is 60 seconds, and it can be configured via `nexus:preconnectTTLMs`. Production services should configure this to as low of a number as possible without prematurely severing connections.
