## Completed

[x] Fix property-dds tests hanging: added opProcessingController.reset() and objProvider.reset()
    in afterEach hooks to dispose containers (clears GC sessionExpiryTimer).
    Root cause: deltaConnectionServer.close() alone doesn't dispose containers.

[x] Remove --exit from local-server-stress-tests: harness already properly disposes
    containers and closes server in finally block.

[x] Fix examples/data-objects/webflow - removed esm-loader-css from mocharc, changed layout.spec.ts
    to import htmlFormatter directly (avoids CSS import chain), and fixed describeCompat/describeWithVersions
    to call provider.reset() before driver.dispose() in cleanup hook.

[x] Fix experimental/dds/tree - SummaryManager.dispose() not closing summarizer container,
    and Summarizer.runCore() leaving dangling Promise.race() 2-minute timeout timers (root causes 8, 9)

[x] Fix packages/framework/client-logger/fluid-telemetry - ApplicationInsights stopPollingInternalLogs

[x] Fix packages/framework/react - already clean

[x] Fix packages/service-clients/odsp-client - already clean

[x] Fix packages/test/test-end-to-end-tests: two-part fix:
    1. patch global.setTimeout in mocha-test-setup/mochaHooks.ts to unref() timers >10s
       (handles N-1 compat timer hangs from Summarizer.runCore() Promise.race() timers)
    2. fix compression.spec.ts describeInstallVersions block: create versionedProvider ONCE
       in before/after hooks instead of per-test in beforeEach/afterEach (fixes socket leak)

## Remaining

- tools/test-tools/.mocharc.cjs: Standalone package (own pnpm-workspace.yaml, not part of main
  monorepo). Tests appear to be trivially clean (just spawnSync) but can't verify without
  separate install. Low priority.
