---
"@fluidframework/server-services-shared": minor
"__section": feature
---

Created a utility function for Redis connection handling

Exported a new function - `closeRedisClientConnections` - that helps shut down Redis connections using the `quit()` command.
