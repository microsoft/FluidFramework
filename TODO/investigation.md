# Investigation: Why mocha tests need --exit flag

## Summary of Root Causes Found

### Root Cause 1: SnapshotRefresher 24-hour timer
**Affected packages:** packages/loader/container-loader

`SnapshotRefresher` creates a 24-hour (86400000ms) `setTimeout` via `Timer.setLongTimeout`.
Tests created `SerializedStateManager` instances without calling `.dispose()` after tests.

**Fix:** Added `afterEach` cleanup to dispose each `SerializedStateManager` instance.

### Root Cause 2: DeliLambda.readClientIdleTimer (60s setInterval)
**Affected packages:** All packages using LocalDeltaConnectionServer directly or via TestTreeProvider/LocalServerTestDriver

`DeliLambda` creates a 60-second `setInterval` (readClientIdleTimer) when the local orderer
is set up. Only cleared when `DeliLambda.close()` is called via `LocalDeltaConnectionServer.close()`.

**Fixes applied:**
- `packages/test/test-drivers/src/localServerTestDriver.ts`: Made `dispose()` async, awaiting `server.close()`
- `packages/test/test-driver-definitions/src/interfaces.ts`: Updated `dispose()` to `void | Promise<void>`
- `packages/test/test-version-utils/src/describeCompat.ts` + `describeWithVersions.ts`: Await `driver.dispose()` in `after` hook
- `packages/test/local-server-tests/src/test/*.spec.ts`: All files changed to `deltaConnectionServer.close()` (instead of just `webSocketServer.close()`)
- `packages/test/test-end-to-end-tests/src/test/dataStoresNested.spec.ts`: Hoisted `driver` to outer scope, added `await driver.dispose()` in `afterEach`

### Root Cause 3: GC timers in ContainerRuntime
**Affected packages:** packages/runtime/container-runtime

`GarbageCollector` creates a MAX_INT32 timer on construction. Tests creating `ContainerRuntime`
instances without disposing them left this timer alive.

**Fix:** Dispose all `ContainerRuntime` instances in test cleanup.

### Root Cause 4: ApplicationInsights diagnosticLogInterval
**Affected packages:** packages/framework/client-logger/fluid-telemetry

ApplicationInsights SDK creates a `setInterval` (10s) for internal log polling, even without
calling `initialize()`. Stop it with `appInsightsClient.stopPollingInternalLogs?.()`.

### Root Cause 5: Quill requires document at ESM module-load time
**Affected packages:** examples/data-objects/inventory-app

`@fluidframework/react` exports Quill-dependent code, which needs `document` at import time.
The fix is a `globalSetup.ts` file that calls `globalJsdom()` at module load time (before test
files are loaded). Named with 'g' so it sorts before 'i' (inventoryApp.test.js) alphabetically.

## All Fixed Packages

| Package | Config.exit removed | Root Cause |
|---------|---------------------|-----------|
| packages/loader/container-loader | ✅ | 1 - SnapshotRefresher |
| packages/runtime/container-runtime | ✅ | 3 - GC timer |
| packages/dds/tree | ✅ | 2 - DeliLambda + GC timer in TestTreeProvider |
| packages/test/local-server-tests | ✅ | 2 - DeliLambda |
| examples/data-objects/table-document | ✅ | 2 - describeCompat driver await |
| packages/framework/client-logger/fluid-telemetry | ✅ | 4 - ApplicationInsights |
| packages/framework/react | ✅ | Already clean |
| packages/test/snapshots | ✅ | Already clean (pending tests) |
| examples/data-objects/webflow | ✅ | Already clean after describeCompat fix |
| packages/service-clients/odsp-client | ✅ | Already clean |
| examples/data-objects/inventory-app | ✅ | 5 - Quill/JSDOM |
| experimental/dds/tree | ✅ | Already clean |
| experimental/PropertyDDS/packages/property-dds | ✅ | 6 - Container GC timer not disposed |
| experimental/PropertyDDS/packages/property-common | ✅ | Already clean |
| experimental/PropertyDDS/packages/property-properties | ✅ | Already clean |
| packages/dds/matrix/src/test/memory | ✅ | Already clean (benchmark) |
| packages/dds/sequence/src/test/memory | ✅ | Already clean (benchmark) |
| packages/dds/map/src/test/memory | ✅ | Already clean (benchmark) |
| packages/test/test-end-to-end-tests | ✅ | 2 - dataStoresNested.spec.ts |
| packages/test/test-end-to-end-tests/benchmark | ✅ | Already clean (benchmark) |
| packages/test/local-server-stress-tests | ✅ | Already clean - harness disposes properly |

## Remaining (not fixed)

- `tools/test-tools/.mocharc.cjs`: Standalone package (own pnpm workspace, not part of main monorepo). Tests appear to be trivially clean (just spawnSync) but can't verify without separate install.

## Root Cause 6: Container not disposed after test (GC sessionExpiryTimer)
**Affected packages:** experimental/PropertyDDS/packages/property-dds

When tests create containers via `TestObjectProvider.makeTestContainer()`/`loadTestContainer()`
or directly via `LocalDeltaConnectionServer`, calling `deltaConnectionServer.close()` alone
is NOT sufficient. The containers themselves have active `ContainerRuntime` instances with a
`GarbageCollector.sessionExpiryTimer` (MAX_INT32 timeout) that must be explicitly cleared
by disposing the containers.

**Pattern:** `opProcessingController.reset()` calls `container.close()` + `container.dispose()`
on all tracked containers, which cascades to `ContainerRuntime.dispose()` → `GarbageCollector.dispose()`
→ `sessionExpiryTimer.clear()`.

**Fix:** In `afterEach`, call `opProcessingController.reset()` BEFORE `deltaConnectionServer.close()`,
or call `objProvider.reset()` if using `TestObjectProvider`.

## Key implementation notes

### describeCompat/describeWithVersions after hook
The `after` hook now awaits `provider.driver.dispose?.()` so LocalDeltaConnectionServer
is fully closed before mocha considers the suite done.

### localServerTestDriver.dispose()
Changed from fire-and-forget `void this._server.close()` to `await this._server.close()`.

### Quill/JSDOM setup pattern
For packages that import @fluidframework/react (which transitively imports Quill):
- Create a `globalSetup.ts` in the test directory
- Name it to sort alphabetically BEFORE the test files (e.g., 'g' before 'i')
- Call `globalJsdom()` at module-load time (top level, not inside before())
- Clean up in `before()` hook; individual tests can call `globalJsdom()` themselves

### Memory/benchmark test mocharcs
The `@fluid-tools/benchmark` library has no `setInterval`/`setTimeout` timers.
Memory tests using this library exit cleanly without `--exit`.
