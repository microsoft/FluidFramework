## Completed

[x] Fix property-dds tests hanging: added opProcessingController.reset() and objProvider.reset()
    in afterEach hooks to dispose containers (clears GC sessionExpiryTimer).
    Root cause: deltaConnectionServer.close() alone doesn't dispose containers.

[x] Remove --exit from local-server-stress-tests: harness already properly disposes
    containers and closes server in finally block.

[x] Fix examples/data-objects/webflow - already clean after describeCompat driver await fix

[x] Fix experimental/dds/tree - already clean after DeliLambda + GC timer fixes

[x] Fix packages/framework/client-logger/fluid-telemetry - ApplicationInsights stopPollingInternalLogs

[x] Fix packages/framework/react - already clean

[x] Fix packages/service-clients/odsp-client - already clean

## Remaining

- tools/test-tools/.mocharc.cjs: Standalone package (own pnpm-workspace.yaml, not part of main
  monorepo). Tests appear to be trivially clean (just spawnSync) but can't verify without
  separate install. Low priority.
