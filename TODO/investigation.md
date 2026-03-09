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
| packages/test/snapshots | ✅ | 10 - worker threads + container dispose leaks |
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
| packages/test/test-end-to-end-tests | ✅ | 2, 11a, 11b, 11c, 11d, 12, 13, 14, 15 - multiple fixes |
| packages/test/test-end-to-end-tests/benchmark | ✅ | Already clean (benchmark) |
| packages/test/local-server-stress-tests | ✅ | Already clean - harness disposes properly |

## Root Cause 11d: describeInstallVersions after hook throws when before hook fails

**Affected packages:** packages/test/test-end-to-end-tests (legacy chunking tests)

When the `before("Create TestObjectProvider")` hook in `describeInstallVersions` fails (e.g. due
to a package installation error for old versions like 0.56.0 that are incompatible with modern
Node.js), `provider` remains `undefined`. The `after("Cleanup TestObjectProvider")` hook was
throwing `"Expected provider to be set up by before hook"` in that case, producing a spurious
test failure.

**Fix:** Changed the `after` hook to `return` early instead of `throw` when `provider === undefined`.

**File changed:** `packages/test/test-version-utils/src/describeWithVersions.ts`

## Root Cause 11a: N-1 SummaryManager.dispose() not closing summarizer container
**Affected packages:** packages/test/test-end-to-end-tests (compat tests using old ContainerRuntime)

When compat tests run with an N-1 `@fluidframework/container-runtime`, the older `SummaryManager.dispose()`
does NOT call `this.summarizer?.close()` (that fix was added in the current version). So when the parent
interactive container is disposed via `provider.reset()`, the summarizer container it had spawned remains
alive with its own `ContainerRuntime` instance holding a `GarbageCollector.sessionExpiryTimer` (MAX_INT32
`setTimeout`), preventing mocha from exiting.

**Fix:** In `LoaderContainerTracker.addContainer()`, non-interactive (summarizer) containers are now
tracked in a separate `trackedSummarizerContainers: Set<IContainer>` instead of being silently discarded.
In `reset()`, after disposing all interactive containers, the summarizer containers are explicitly disposed
too. This is idempotent for the current runtime version (where `SummaryManager.dispose()` already closes
the summarizer), but critical for N-1 compat scenarios.

**File changed:**
`packages/test/test-utils/src/loaderContainerTracker.ts`

## Root Cause 11b: TestObjectProviderWithVersionedLoad has two drivers; only one was disposed
**Affected packages:** packages/test/test-end-to-end-tests (compat tests)

`TestObjectProviderWithVersionedLoad` (used for cross-client compat tests) maintains two separate
`LocalServerTestDriver` instances: `driverForCreating` and `driverForLoading`. Each driver has its own
`LocalDeltaConnectionServer` with a `DeliLambda.readClientIdleTimer` (60-second `setInterval`).

The `describeCompat` and `describeWithVersions` `after` hooks previously called
`await provider.driver.dispose?.()`, which invokes the `driver` getter. That getter returns either
`driverForCreating` or `driverForLoading` based on the `useCreateApi` flag (set to `true` by `reset()`).
So only `driverForCreating` was ever disposed, leaving `driverForLoading`'s server and its 60-second
`setInterval` alive.

**Fix 1:** Added `dispose(): Promise<void>` to the `ITestObjectProvider` interface and implemented it in:
- `TestObjectProvider.dispose()`: delegates to `await this.driver.dispose?.()` (single driver)
- `TestObjectProviderWithVersionedLoad.dispose()`: explicitly disposes BOTH `driverForCreating` AND
  `driverForLoading`, ensuring both `LocalDeltaConnectionServer` instances are closed.

**Fix 2:** Changed `describeCompat.ts` and `describeWithVersions.ts` `after("Cleanup TestObjectProvider")`
hooks to call `await provider.dispose()` instead of `await provider.driver.dispose?.()`.

**Files changed:**
- `packages/test/test-utils/src/testObjectProvider.ts`
- `packages/test/test-version-utils/src/describeCompat.ts`
- `packages/test/test-version-utils/src/describeWithVersions.ts`

## Root Cause 11c: Local TestObjectProvider instances in container.spec.ts never reset
**Affected packages:** packages/test/test-end-to-end-tests

Three tests in `container.spec.ts` created their own `TestObjectProvider` instances (with `new
TestObjectProvider(Loader, provider.driver, runtimeFactory)`) locally inside `it()` blocks, without
calling `.reset()` at the end. The containers tracked by these local providers were never disposed,
leaving their `GarbageCollector.sessionExpiryTimer` (MAX_INT32 `setTimeout`) running after the tests.

**Affected tests:**
- "Delta manager receives readonly event when calling container.forceReadonly()"
- "getPendingLocalState() called on container"
- "can control op processing with connect() and disconnect()"

**Fix:** Wrapped each test body in a `try/finally` block, calling `localTestObjectProvider.reset()` in
the `finally` clause to ensure cleanup even if the test throws.

**File changed:**
`packages/test/test-end-to-end-tests/src/test/container.spec.ts`

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

## Root Cause 8: Summarizer container GC timer not cleared after parent container disposed
**Affected packages:** experimental/dds/tree, packages/dds/tree

When a parent (interactive) container is disposed, the summarizer container it had spawned via
`startSummarization()` was left alive. The summarizer container holds its own `ContainerRuntime`
with a `GarbageCollector.sessionExpiryTimer` (MAX_INT32 timeout) that kept the process alive.

**Initial fix attempt (reverted):** Added `this.summarizer?.close()` in `SummaryManager.dispose()`.
This caused a regression: `close()` triggers an async chain that calls back into the (now-disposed)
interactive container's runtime, producing spurious "Runtime is closed" `ContainerClose` events
that failed the "Verify container telemetry" afterEach hook in the mixinSummaryHandler test.

**Actual fix:** In `LoaderContainerTracker.addContainer()`, non-interactive (summarizer) containers
are tracked in `trackedSummarizerContainers`. In `reset()`, they are explicitly disposed via
`container.dispose()` (NOT `container.close()`, to avoid `ContainerClose` telemetry events).
This is the root cause 11a fix. It covers both N-1 compat and current version.

**Files changed:**
`packages/test/test-utils/src/loaderContainerTracker.ts`

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

## Root Cause 10: Worker thread MessagePort + container dispose leaks (packages/test/snapshots)
**Affected packages:** packages/test/snapshots

Three leaks:

1. **Worker threads staying alive**: `processNode()` creates Worker threads to run `processOneNode()`.
   After work completes, the worker posts "true" and the parent resolves the promise. BUT the worker
   thread itself stays alive because its containers were closed via `container.close()` (not `dispose()`),
   leaving GC sessionExpiryTimers (MAX_INT32) running in the worker. The live worker keeps its
   `MessagePort` open in the parent thread, which holds a reference in the parent's event loop.
   **Fix:** Call `worker.terminate()` immediately after the worker sends "true", proactively releasing
   all worker resources.

2. **validateSnapshots.ts containers not disposed**: In `Mode.BackCompat`, `validateSnapshots()` runs
   in the main thread (not a worker) and calls `loadContainer()` + `uploadSummary()` but never disposes
   the container. The container's GC sessionExpiryTimer (MAX_INT32) keeps the process alive.
   **Fix:** Added `finally { container?.dispose(); }`.

3. **LocalDeltaConnectionServer not closed in serialized.spec.ts**: Each test created its own
   `LocalDeltaConnectionServer` (even though containers are detached and never connect). Also,
   `LoaderContainerTracker` was never reset.
   **Fix:** Collect servers in an array, add `after()` hook to close them and reset the tracker.
   Note: detached containers don't create DeliLambda timers (orderer is only created on connection),
   so these servers didn't actually cause the hang in practice, but cleaning them up is correct.

**Files changed:**
- `packages/test/snapshots/src/replayMultipleFiles.ts`: `worker.terminate()` on success
- `packages/test/snapshots/src/validateSnapshots.ts`: `finally { container?.dispose() }`
- `packages/test/snapshots/src/test/serialized.spec.ts`: track servers + `after()` cleanup

## Root Cause 12: NoopHeuristic timer not cleared on container close/dispose

**Affected packages:** packages/loader/container-loader (and all packages with containers)

`NoopHeuristic` holds a `Timer` (2000ms `setTimeout`) that fires after an op is processed if no
ops were sent by the client. Neither `container.ts`'s `closeCore()` nor `disposeCore()` cleared
this timer, so after tests, 400+ active `Timeout` objects were keeping the event loop alive.

**Fix:**
- Added `dispose()` method to `NoopHeuristic` that calls `this.timer?.clear()`
- Added `this.timer?.clear()` to `notifyDisconnect()` (timer shouldn't keep the event loop alive after disconnect; will be restarted on reconnect when the next op arrives)
- In `container.ts` `closeCore()`: call `this.noopHeuristic?.dispose(); this.noopHeuristic = undefined`
- In `container.ts` `disposeCore()`: same cleanup (handles dispose-without-close-first)

**Files changed:**
- `packages/loader/container-loader/src/noopHeuristic.ts`
- `packages/loader/container-loader/src/container.ts`

## Root Cause 13: SummaryManager.delayBeforeCreatingSummarizer() timer not cancellable

**Affected packages:** packages/runtime/container-runtime

`SummaryManager.delayBeforeCreatingSummarizer()` creates a 5-second `setTimeout` to delay
summarizer creation after election. The timer was stored in a local variable inside the function
and was not accessible from `dispose()`. If the container was disposed while the delay was
running, the timer kept the event loop alive for up to 5 seconds.

**Fix:** Promoted the timer to a class field `delayBeforeCreatingSummarizerTimer`. In `dispose()`,
cancel it with `clearTimeout()`. Also clear it after `Promise.race()` resolves (in case the
op-count branch resolved the promise without going through the timer's `clearTimeout` path).

**File changed:** `packages/runtime/container-runtime/src/summary/summaryManager.ts`

## Root Cause 14: ContainerRuntime.fetchLatestSnapshotAndMaybeClose() non-cancellable delay

**Affected packages:** packages/runtime/container-runtime

`ContainerRuntime.fetchLatestSnapshotAndMaybeClose()` used a `delay()` utility (5-second
`setTimeout`) to wait before closing the summarizer after fetching a snapshot. The `delay()`
call was not cancellable, so if the container was disposed mid-delay, the timer kept the event
loop alive.

**Fix:** Replaced `await delay(ms)` with a cancellable promise pattern: stored the timer and
resolve function in `this.closeSummarizerDelayHandle`. In `dispose()`, cancel the timer and
resolve the promise early. Added a `_disposed` guard after the delay to skip the close logic
if the container was disposed during the wait.

**File changed:** `packages/runtime/container-runtime/src/containerRuntime.ts`

## Root Cause 15: noDeltaStream.spec.ts containers bypass LoaderContainerTracker

**Affected packages:** packages/test/test-end-to-end-tests

Several containers in `noDeltaStream.spec.ts` were created via `createLoader()` / direct loader
APIs outside of the `TestObjectProvider` factory methods. These containers bypassed the
`LoaderContainerTracker`, so they were never disposed by `provider.reset()`. Their
`GarbageCollector.sessionExpiryTimer` (MAX_INT32 `setTimeout`) kept the process alive.

**Fix:** Wrapped container usage in `try/finally` blocks to call `container.close()` +
`container.dispose()` after each test.

**File changed:** `packages/test/test-end-to-end-tests/src/test/noDeltaStream.spec.ts`
