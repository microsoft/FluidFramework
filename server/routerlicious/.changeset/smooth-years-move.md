---
"@fluidframework/server-services-shared": minor
---

Startup probe not a singleton anymore

Singleton implementation of this module caused bugs to surface in Historian. Hence, reverted the singleton implementation to a regular one.
