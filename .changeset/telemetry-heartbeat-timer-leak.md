---
"@fluidframework/fluid-telemetry": minor
"__section": fix
---
Containers passed to startTelemetry are no longer kept in memory after they are disposed

Previously, `startTelemetry` started a heartbeat timer that was never stopped.
That timer kept the container, along with its telemetry producer and consumers, in memory for the lifetime of the process, even after the container was disposed.
In Node.js, it also stopped the process from exiting.
The heartbeat timer now stops when the container is disposed.
