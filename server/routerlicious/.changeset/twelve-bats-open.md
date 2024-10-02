---
"@fluidframework/server-services": minor
---

Added Collaboration Session Tracking implementations

Added `CollaborationSessionTracker` implementation of `ICollaborationSessionTracker` and `RedisCollaborationSessionManager` implementation of `ICollaborationSessionManager`. These are used internally within the Nexus lambda to track session information for telemetry purposes.
