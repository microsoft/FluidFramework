---
"@fluidframework/server-lambdas": minor
---

Optional session tracking added to Nexus Lambda

An optional `ICollaborationSessionTracker` param was added to `configureWebSocketServices` in the Nexus Lambda. When provided, this tracker is used to output telemetry when a collaboration session for a document/container ends. The telemetry includes helpful information such as session duration, max concurrent clients, whether there were any writer clients involved, etc.
