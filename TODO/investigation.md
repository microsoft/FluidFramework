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
| packages/dds/tree | ✅ | 8, 9 - same container-runtime fix applies |
| packages/test/local-server-tests | ✅ | 2 - DeliLambda |
| examples/data-objects/table-document | ✅ | 2 - describeCompat driver await |
| packages/framework/client-logger/fluid-telemetry | ✅ | 4 - ApplicationInsights |
| packages/framework/react | ✅ | 7 - JSDOM timers + IFluidContainer.dispose() |
| packages/test/snapshots | ✅ | Already clean (pending tests) |
| examples/data-objects/webflow | ✅ | 2 - describeCompat/WithVersions missing provider.reset() + esm-loader-css removed |
| packages/service-clients/odsp-client | ✅ | Already clean |
| examples/data-objects/inventory-app | ✅ | 5 - Quill/JSDOM |
| experimental/PropertyDDS/packages/property-dds | ✅ | 6 - Container GC timer not disposed |
| experimental/dds/tree | ✅ | 8, 9 - SummaryManager + Summarizer timer leaks |
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

## Root Cause 7: JSDOM timers + IFluidContainer.dispose() not calling ContainerRuntime.dispose()
**Affected packages:** packages/framework/react

Two issues:
1. **JSDOM requestAnimationFrame timers**: When tests call `globalJsdom()` and render React
   components, JSDOM's `requestAnimationFrame` (implemented as recursive `setTimeout`) keeps the
   process alive. Fix: call `jsdom.window.close()` (which calls `stopAllTimers()`) before
   `cleanup()` in `after()` hooks. Note: `cleanup()` alone does NOT stop timers.

2. **IFluidContainer.dispose() called container.close() instead of container.dispose()**:
   `FluidContainer.dispose()` was calling `this.container.close()` which goes through `closeCore()`
   and emits "closed" but does NOT call `disposeCore()`. Only `disposeCore()` calls
   `this._runtime?.dispose()` which triggers `ContainerRuntime.dispose()` →
   `GarbageCollector.dispose()` → `sessionExpiryTimer.clear()`. Fix: changed to
   `this.container.dispose()` and added "disposed" event listener (in addition to "closed")
   in `FluidContainer` constructor.

**Files changed:**
- `packages/framework/fluid-static/src/fluidContainer.ts`: Call `container.dispose()` instead
  of `container.close()` in `FluidContainer.dispose()`; also subscribe to "disposed" event
- `packages/framework/react/src/test/mochaHooks.ts`: Add `window.close()` before `cleanup()`
- `packages/framework/react/src/test/reactSharedTreeView.spec.tsx`: Wrap test in try/finally
  with `container.dispose()`, add `window.close()` to DOM tests `after()` hook
- `packages/framework/react/src/test/{useObservation,useTree}.spec.tsx`: Add `window.close()`
- `packages/framework/react/src/test/text/textEditor.test.tsx`: Add `window.close()`

## Notes for pending packages

- There are still packages whose mocha tests hang. Tackle them one by one.
- For each: `pnpm build`, then `pnpm test:mocha`. Rebuild and re-test after every fix attempt.
- Use `.only` on specific test suites to identify exactly which ones are hanging.

## Root Cause 8: SummaryManager.dispose() not closing summarizer container
**Affected packages:** experimental/dds/tree, packages/dds/tree

When a parent (interactive) container is disposed, `SummaryManager.dispose()` was not closing
the summarizer container it had spawned via `startSummarization()`. The summarizer container
holds its own `ContainerRuntime` with a `GarbageCollector.sessionExpiryTimer` (MAX_INT32
timeout) and other resources that keep the process alive.

**Fix:** In `SummaryManager.dispose()`, added `this.summarizer?.close()` and
`this.summarizer = undefined` after clearing the stop timeout.

**File changed:**
`packages/runtime/container-runtime/src/summary/summaryManager.ts`

## Root Cause 9: Summarizer.runCore() leaving dangling Promise.race() timers
**Affected packages:** experimental/dds/tree, packages/dds/tree

`Summarizer.runCore()` uses two `Promise.race()` patterns with `setTimeout` for timeouts
(both 2 minutes). When the non-timeout promise wins the race, the losing `setTimeout` is
never cancelled, leaving it alive for 2 minutes and preventing mocha from exiting.

- **Timer 1**: Race between `runCoordinatorCreateFn()` and a 2-minute coordinator creation
  timeout. If the coordinator is created first, the 2-minute timer was never cleared.
- **Timer 2**: Race between `runningSummarizer.waitStop()` and a 2-minute stop timeout.
  If `waitStop` completes first, the 2-minute timer was never cleared.

**Fix:** Store the timeout IDs in variables and call `clearTimeout()` on them when
`Promise.race()` resolves (for Timer 1, clear it inside the non-timeout `.then()` callback;
for Timer 2, clear it unconditionally after `await Promise.race()`).

**File changed:**
`packages/runtime/container-runtime/src/summary/summaryDelayLoadedModule/summarizer.ts`
