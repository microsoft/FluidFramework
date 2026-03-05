# Investigation: Why mocha tests need --exit flag

## Summary of Root Causes Found

### Root Cause 1: SnapshotRefresher 24-hour timer (CONFIRMED via --detect-open-handles)
**Affected packages:** packages/loader/container-loader (and likely others)

`SnapshotRefresher` creates a 24-hour (86400000ms) `setTimeout` via the `Timer` class's
`setLongTimeout`. Tests create `SerializedStateManager` instances (which own a `SnapshotRefresher`)
without calling `.dispose()` after the test completes. The timer keeps the process alive.

**Location:** `packages/loader/container-loader/src/test/serializedStateManager.spec.ts`
**Fix:** Add `afterEach` cleanup to call `serializedStateManager.dispose()` for each test
that creates an instance with offline load enabled.

### Root Cause 2: DeliLambda.readClientIdleTimer (CONFIRMED by code analysis)
**Affected packages:** Any package that uses TestTreeProvider.create() or TestObjectProvider
with a local server driver (e.g. packages/dds/tree, packages/test/local-server-tests, etc.)

`DeliLambda` creates a 60-second `setInterval` (readClientIdleTimer) when the local orderer
is set up. This timer is only cleared when `DeliLambda.close()` is called, which happens when
`LocalServerTestDriver.dispose()` is called. Tests that use `TestTreeProvider.create()` directly
(not through `describeCompat`) don't call `driver.dispose()` after tests.

`describeCompat` already handles this with `provider.driver.dispose?.()` in its `after` hook,
but calls it fire-and-forget (not awaited). This still causes a brief hang while the async
cleanup chain completes.

**Location:** packages/dds/tree/src/test/* (and others using TestTreeProvider)
**Fix:** Add proper cleanup for TestTreeProvider instances in tests

### Root Cause 3: JSDOM (suspected)
**Affected packages:** packages/framework/react

JSDOM keeps the process alive through internal timers and window/document event handling.
Tests use `globalJsdom()` from the `global-jsdom` package.
**Status:** Not yet confirmed via diagnostics.

### Root Cause 4: Other packages (unknown)
**Affected packages:** packages/runtime/container-runtime, and others

Likely similar to root cause 1 (SnapshotRefresher or similar timed objects), but not yet confirmed.

## Packages affected
- packages/dds/tree (Root cause 2 - TestTreeProvider not disposed)
- packages/runtime/container-runtime (Root cause 4 - TBD)
- packages/loader/container-loader (Root cause 1 - SnapshotRefresher 24h timer - CONFIRMED)
- packages/service-clients/odsp-client (Root cause 2 - likely local server)
- packages/test/local-server-tests (Root cause 2 - local server)
- packages/test/snapshots (Root cause 4 - TBD)
- packages/framework/react (Root cause 3 - JSDOM)
- packages/framework/client-logger/fluid-telemetry (Root cause 4 - TBD)
- packages/test/test-end-to-end-tests/src/test (Root cause 2 - local server)
- examples/data-objects/table-document (Root cause 2 - uses describeCompat with local server)
- examples/data-objects/webflow (Root cause 4 - TBD)
- examples/data-objects/inventory-app (Root cause 4 - TBD)

## Tasks

### Done
- [x] Understand scope of the problem
- [x] Identify primary root cause (DeliLambda.readClientIdleTimer for local server packages)
- [x] Confirm secondary root cause (SnapshotRefresher 24h timer via diagnostics)

### Done (continued)
- [x] Fix packages/loader/container-loader (serializedStateManager.spec.ts cleanup)
  - Added `makeSsm()` factory helper + `instancesToDispose` tracking array at outer describe scope
  - `afterEach` disposes all tracked instances, preventing 24h SnapshotRefresher timers from leaking
  - Removed `config.exit = true` from `.mocharc.cjs`

### Todo
- [ ] Fix packages/dds/tree (TestTreeProvider disposal)
- [ ] Run diagnostics on packages/runtime/container-runtime
- [ ] Run diagnostics on packages/framework/react
- [ ] Fix remaining packages after root causes confirmed
- [ ] Remove --exit flag from fixed packages and verify tests pass

## Key findings

1. `packages/loader/container-loader/src/test/serializedStateManager.spec.ts`:
   - Creates SerializedStateManager instances (with SnapshotRefresher) without disposing them
   - The SnapshotRefresher's internal Timer (24h default) keeps the process alive
   - Fix: Add afterEach/after cleanup to dispose each SerializedStateManager

2. `packages/dds/tree/.mocharc.cjs` already has comment:
   > "In this package, tests which use TestTreeProvider.create cause this issue"
   - TestTreeProvider creates LocalServerTestDriver → LocalDeltaConnectionServer
   - DeliLambda (inside the server) creates a 60s setInterval (readClientIdleTimer)
   - Not cleared because driver.dispose() is never called after tests

3. describeCompat already does driver.dispose() (line 182 in describeCompat.ts),
   but fire-and-forget (not awaited), so it's still async.

## Test diagnostic approach used
```bash
# Create a script to trace timer creation and report on SIGTERM:
cat > /tmp/mocha_trace.js << 'EOF'
# (intercepts setTimeout/setInterval and logs on SIGTERM)
EOF

# Run tests and send SIGTERM after completion:
cd /workspaces/FluidFramework/packages/loader/container-loader
mocha --no-exit --require /tmp/mocha_trace.js "lib/test/loader.spec.js" &
PID=$!
sleep 5
kill -TERM $PID
# Look at output for active timer stacks
```
