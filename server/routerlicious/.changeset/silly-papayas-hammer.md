---
"@fluidframework/server-routerlicious-base": major
---

Added support for Redis graceful shutdown

Now there's a way to ensure that Redis connections are gracefully shut down when disposing service factory resources. There is a new required param, `redisClientConnectionManagers`, in the Nexus, Alfred, and Riddler RunnerFactories. This is scoped to r11s-base.
