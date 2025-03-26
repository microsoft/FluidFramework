---
"@fluidframework/server-routerlicious": major
---

Socket Latency Telemetry strategy changed to per-socket-connection

Socket latency tracking strategy was changed to a per-socket strategy for better telemetry granularity. With this, a new config was added (`nexus.socketIo.pingPongLatencyTrackingAggregationThreshold`) and an old config was removed (`nexus.socketIo.pingPongLatencyTrackingIntervalMs`).