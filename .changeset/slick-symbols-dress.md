---
"@fluidframework/container-runtime": major
---

Make op grouping On by default

Op grouping feature reduces number of ops on the wire by grouping all ops in a batch. This allows applications to substantially reduce chances of being throttled by service when sending a lot of ops.
This feature could be enabled only by applications that have consumed 2.0.0-internal.7.0.2 version and have application version based on it saturated in the marker (to 99.99% or higher). Enabling it too soon will result on old client crashing when processing grouped ops.

The feature has been proven in production in Loop app, as it was enabled through feature gates at 100% in PROD.
All internal applications (Loop, Whiteboard) that send telemetry to our common Kusto tenant are already at or above minimal required version of runtime.

If your application does not satisfy these deployment requirements, please disable op grouping via passing IContainerRuntimeOptions.enableGroupedBatching = false when calling ContainerRuntime.load().
