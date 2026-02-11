# Fluid Framework Client Packages: Async & Structured Concurrency Benefit Analysis

Analysis of packages in the client workspace, rated by async code density and potential benefit
from automatic resource handling using structured concurrency principles (e.g., the effection library).

## Background: What Effection Provides

[Effection](https://frontside.com/effection) is a structured concurrency library for JavaScript/TypeScript
that provides:

- **Scoped resource lifecycles**: Resources created in a scope are automatically cleaned up when the scope exits
- **`resource()`**: Define managed resources (connections, timers, listeners) with guaranteed teardown
- **`spawn()`**: Launch concurrent tasks that are automatically halted when their parent completes
- **`call()`**: Wrap async functions into scope-aware operations with error boundaries
- **Automatic cancellation**: No need for manual AbortController/signal wiring — scope exit halts everything

These replace manual patterns like cleanup arrays, dispose chains, clearTimeout calls,
removeListener bookkeeping, and AbortController propagation.

## Rating System

**Async Density** (amount of async code): Low / Medium / High / Very High

**Effection Benefit** (how much structured concurrency would help): 1-5 stars
- `*` = Minimal benefit (mostly sync, simple patterns)
- `**` = Some benefit (moderate async, manageable cleanup)
- `***` = Moderate benefit (significant async, manual resource tracking)
- `****` = High benefit (complex lifecycles, multiple concurrent resources)
- `*****` = Transformative benefit (deeply nested async lifecycles, error-prone teardown)

---

## Tier 1: Highest Benefit from Structured Concurrency

### `@fluidframework/container-runtime`

| Metric | Value |
|---|---|
| Async Density | **Very High** |
| Async functions | ~132 across 39 files |
| `await` statements | ~964 across 45 files |
| `new Promise` | 37 across 14 files |
| `Deferred` usage | 33 across 10 files |
| dispose/close refs | ~150 across 36 files |
| `.off()` cleanup | 52 across 14 files |
| Timer usage | 20 across 6 files |
| **Effection Benefit** | **`*****`** |

**Why:** This is the most complex async package in the entire workspace. It manages summarization
(RunningSummarizer, SummaryManager), garbage collection with session timers, blob management,
PendingStateManager, and data store lifecycles. It has hand-rolled cleanup arrays
(`eventsCleanup: (() => void)[]`), multiple timer types (idle timers, ack timers, expiry timers),
and deeply nested concurrent operations via `Promise.all/race` (24 occurrences). Effection's
`resource()` pattern would replace all manual dispose chains, `spawn()` would manage the
summarizer/GC background tasks, and scope-based teardown would eliminate the risk of missed cleanup
in error paths.

Key subsystems that would benefit:
- `RunningSummarizer` with its `eventsCleanup` array and `pendingAckTimer`
- `SummaryGenerator` with `summarizeTimer`
- `SummarizerHeuristics` with `idleTimer`
- `GarbageCollection` with session expiry timer and unreferenced node timers
- `ContainerRuntime.dispose()` comprehensive cleanup of all subsystems

---

### `@fluidframework/container-loader` (packages/loader/container-loader)

| Metric | Value |
|---|---|
| Async Density | **Very High** |
| Async functions | ~95 |
| `.then()` calls | 51 across 13 files |
| `new Promise` | ~6 |
| dispose/close refs | ~60+ |
| AbortController | 13 across 8 files |
| Socket/connection mgmt | Heavy (ConnectionManager, DeltaManager) |
| `finally` blocks | 10 files |
| **Effection Benefit** | **`*****`** |

**Why:** Manages the entire container lifecycle: WebSocket delta stream connections, reconnection
loops with retry/backoff, abort signals, connection state machines, and coordinated teardown of
ConnectionManager + DeltaManager + Protocol. The `ConnectionManager.setupNewSuccessfulConnection` /
`disconnectFromDeltaStream` pattern is a textbook case for effection's `resource()` — the connection
could be modeled as a resource that auto-cleans on scope exit. The reconnection loop with
cancellation is exactly what `spawn()` + scope teardown replaces.

Key patterns that map directly to effection:
- `ConnectionManager` WebSocket lifecycle -> `resource()`
- Reconnection loop with backoff -> `spawn()` with automatic cancellation
- `DeltaManager.dispose()` with `removeAllListeners()` -> scope exit
- AbortController propagation (13 occurrences) -> native scope cancellation

---

### `@fluidframework/odsp-driver`

| Metric | Value |
|---|---|
| Async Density | **Very High** |
| Async functions | ~123 across 37 files |
| `.catch()` | 70 across 27 files |
| `finally` blocks | 15 across 6 files |
| Socket/HTTP refs | ~1,510 across 59 files |
| Timer usage | 18 across 10 files |
| AbortController | 25 across 12 files |
| **Effection Benefit** | **`*****`** |

**Why:** The most I/O-intensive package. Manages socket connection pooling with reference counting
(`SocketReference` class with delayed 2-second cleanup), token refresh timers
(`joinSessionRefreshTimer`), OpsCache with timer-based flushing, and extensive HTTP fetch operations.
The socket pool with manual reference counting is exactly the kind of resource lifecycle that
effection's scoped resources eliminate. The `AbortController` usage (25 occurrences) shows the team
is already fighting cancellation problems that structured concurrency solves natively.

Key patterns:
- `SocketReference` class with manual ref counting -> `resource()` with scope ownership
- `OpsCache.dispose()` clearing timers and batches -> scope-based teardown
- `joinSessionRefreshTimer` management -> `spawn()` background task
- 25 AbortController usages -> eliminated by scope cancellation

---

### `@fluid-internal/test-service-load`

| Metric | Value |
|---|---|
| Async Density | **High** |
| Async functions | ~37 |
| `.then()` calls | 6 |
| `new Promise` | 12 |
| `.catch()` | 9 across 3 files |
| Event listeners | 35+ registrations |
| Timer cleanup | 10 setTimeout, only 1 clearTimeout |
| **Effection Benefit** | **`****`** |

**Why:** Long-running stress test orchestrator managing multiple containers, runners, and data
stores concurrently. Has timer-based operations, event-driven coordination between containers, and
fault injection patterns. The timer imbalance (10 setTimeout vs 1 clearTimeout) is a concrete
resource leak risk that structured concurrency eliminates by design. Effection's `sleep()` is
automatically cancelled when the parent scope exits.

---

## Tier 2: Significant Benefit

### `@fluidframework/routerlicious-driver`

| Metric | Value |
|---|---|
| Async Density | **High** |
| Async functions | ~76 across 21 files |
| `.catch()` | 13 across 7 files |
| dispose pattern | **Empty `dispose()` method** |
| **Effection Benefit** | **`****`** |

**Why:** Has an **empty `dispose()` method** in `DocumentService` — a clear sign that cleanup is
under-implemented. Manages WebSocket connections (via base class), REST API calls with rate limiting
(24 concurrent max), and multiple cache implementations without explicit disposal. Effection would
enforce proper cleanup through scope-based resource management.

---

### `@fluidframework/agent-scheduler`

| Metric | Value |
|---|---|
| Async Density | **Medium** |
| Async functions | ~12 |
| `new Promise` | 1 |
| **No dispose method** | Despite being long-lived |
| **Effection Benefit** | **`***`** |

**Why:** No `dispose()` method despite being a long-lived object with quorum event listeners.
Event listener on quorum (line 276) may not be removed. Effection's scope-based teardown would
auto-cleanup quorum listeners when the scheduler scope exits.

---

### `@fluidframework/datastore`

| Metric | Value |
|---|---|
| Async Density | **Medium-High** |
| Async functions | 26 across 6 files |
| `await` | 45 across 8 files |
| dispose refs | 8 across 3 files |
| **Effection Benefit** | **`***`** |

**Why:** Manages data store runtime, channel contexts (remote and local), and storage services.
Relies on parent container-runtime for lifecycle but has its own async loading paths. The `Deferred`
pattern usage (2 instances) and channel delta connections suggest moderate benefit from structured
task management.

---

### `@fluidframework/dds/tree` (SharedTree)

| Metric | Value |
|---|---|
| Async Density | **Medium** (mostly sync core, async in lifecycle) |
| dispose calls | 50+ (branches, checkouts, views, transactions, indexes) |
| removeListener | Significant cleanup code |
| **Effection Benefit** | **`***`** |

**Why:** While the core tree algorithms are synchronous, the lifecycle management is complex.
TreeCheckout, branches, transactions, views, and indexes all implement `dispose()` with cascading
teardown (e.g., `TreeCheckout.dispose()` disposes transaction branch, transaction, revertibles,
and all views). This cascading dispose pattern maps well to effection's nested scopes.

---

### `@fluidframework/dds/sequence` + `@fluidframework/dds/merge-tree`

| Metric | Value |
|---|---|
| Async Density | **Low-Medium** |
| dispose patterns | Intervals, interval collections, revertibles |
| removeListener | 5+ per package |
| **Effection Benefit** | **`***`** |

**Why:** IntervalCollection manages interval lifecycles with dispose, and the merge-tree has
attribution policy listeners. The test infrastructure (`TestClientLogger`) has explicit dispose
patterns. Moderate benefit for managing the interval lifecycle graph.

---

### `@fluidframework/driver-utils`

| Metric | Value |
|---|---|
| Async Density | **Medium** |
| Async functions | ~57 across 16 files |
| AbortController | 13 occurrences |
| **Effection Benefit** | **`***`** |

**Why:** Provides connection retry utilities and throttling that other drivers depend on. The
`runWithRetry` function with AbortSignal support and `parallelRequests` with timer cleanup are
patterns that structured concurrency makes more composable.

---

### `@fluidframework/devtools-core` (packages/tools/devtools)

| Metric | Value |
|---|---|
| Async Density | **Medium** |
| Async functions | ~71 across 11 files |
| dispose patterns | BaseDevtools with window message handlers |
| Event listeners | Window message listeners, container event handlers |
| **Effection Benefit** | **`***`** |

**Why:** Manages window message handlers, container event subscriptions, and data visualization
graphs with explicit disposal. The `BaseDevtools` class has multiple event handlers that need
coordinated cleanup. Exemplary existing disposal patterns, but would still benefit from scope-based
automation.

---

## Tier 3: Moderate Benefit

### `@fluidframework/dds/task-manager`

| Metric | Value |
|---|---|
| Async Density | **Low-Medium** |
| removeListener | 19 occurrences |
| **Effection Benefit** | **`**`** |

**Why:** Heavy event listener management relative to its size, but limited async operations.

---

### `@fluidframework/dds/map` + `@fluidframework/dds/directory`

| Metric | Value |
|---|---|
| Async Density | **Low** |
| dispose refs | ~10 |
| **Effection Benefit** | **`**`** |

**Why:** Directory has dispose patterns (`dispose(error?)`) but mostly synchronous operations.

---

### `@fluidframework/local-driver`

| Metric | Value |
|---|---|
| Async Density | **Medium** |
| Async functions | 40 across 8 files |
| **Effection Benefit** | **`**`** |

**Why:** Clean async/await throughout, basic resource cleanup. Simpler I/O patterns than ODSP.

---

### `@fluidframework/fluid-static` (packages/framework/fluid-static)

| Metric | Value |
|---|---|
| Async Density | **Medium** |
| Async functions | ~14 |
| dispose patterns | 3 in FluidContainer |
| **Effection Benefit** | **`**`** |

**Why:** Container creation/loading wrappers with moderate async. Benefits from cleaner container
lifecycle management.

---

### `@fluidframework/presence`

| Metric | Value |
|---|---|
| Async Density | **Low** (synchronous signal-based architecture) |
| Timer usage | 26 occurrences across 5 files |
| Event cleanup | 22 occurrences across 10 files |
| **Effection Benefit** | **`**`** |

**Why:** Has a well-designed `TimerManager` abstraction for centralized timer cleanup, but the
heavy timer usage (26 occurrences) still requires manual management. Effection would simplify
the timer lifecycle.

---

### `@fluidframework/test-utils`

| Metric | Value |
|---|---|
| Async Density | **Medium** |
| Async functions | ~59 |
| Event listeners | 20+ registrations |
| Timer cleanup | 7 clearTimeout calls |
| **Effection Benefit** | **`**`** |

**Why:** `LoaderContainerTracker` manages container lifecycle tracking with event listeners.
Comments about memory leaks in test contexts suggest past issues. Structured concurrency would
simplify the test container lifecycle.

---

### `@fluid-experimental/tree` (Legacy SharedTree)

| Metric | Value |
|---|---|
| Async Density | **Medium** |
| Async functions | ~20 in source |
| Timer mgmt | heartbeat timer with clearInterval |
| Event cleanup | `.off()` patterns |
| try-catch | 230+ occurrences |
| **Effection Benefit** | **`**`** |

**Why:** `MergeHealth` has heartbeat timer management, SharedTree has async `loadCore`. Migration
shim manages tree swapping with complex state. Moderate benefit from scope-based resource management.

---

### `@fluidframework/tool-utils`

| Metric | Value |
|---|---|
| Async Density | **Medium** |
| Async functions | ~23 |
| Lock management | try/finally with async-mutex |
| **Effection Benefit** | **`**`** |

**Why:** Excellent existing lock management with try/finally. HTTP server for token acquisition
could be modeled as an effection resource.

---

## Tier 4: Low Benefit

### `@fluidframework/core-utils` (packages/common/core-utils)

| Metric | Value |
|---|---|
| Async Density | **Low** |
| Key classes | Timer, PromiseTimer, PromiseCache, delay() |
| clearTimeout | 5 occurrences |
| **Effection Benefit** | **`*`** |

**Why:** Provides the `Timer` and `PromiseCache` primitives that _other_ packages use. These could
potentially be reimplemented as effection resources, which would cascade benefits upward. But the
package itself is simple. Note: `delay()` utility has no cancellation mechanism — a gap that
effection's `sleep()` fills natively.

---

### `@fluidframework/dds/cell`, `counter`, `matrix`, `shared-object-base`

| Metric | Value |
|---|---|
| Async Density | **Low** |
| **Effection Benefit** | **`*`** |

**Why:** Mostly synchronous DDS implementations. `shared-object-base` provides foundational
`dispose()` pattern (callbacksHelper + opProcessingHelper cleanup) inherited by all DDSs.
Minimal resource management needed beyond what the base class provides.

---

### `@fluidframework/runtime-utils`, `@fluidframework/id-compressor`

| Metric | Value |
|---|---|
| Async Density | **Minimal to None** |
| **Effection Benefit** | **`*`** |

**Why:** `id-compressor` is **entirely synchronous** — pure computation with zero async functions,
zero promises, zero awaits. `runtime-utils` is stateless utilities. No resource management needed.

---

### `@fluidframework/azure-client`, `@fluidframework/odsp-client`

| Metric | Value |
|---|---|
| Async Density | **Low** |
| **Effection Benefit** | **`*`** |

**Why:** High-level wrapper APIs that delegate to drivers. The real async complexity lives in the
driver packages underneath.

---

### `@fluidframework/file-driver`

| Metric | Value |
|---|---|
| Async Density | **Low** |
| Async functions | 15 across 4 files |
| **Effection Benefit** | **`*`** |

**Why:** Minimal async complexity (file I/O only). Simple `close()` methods. No timer or event
listener management needed.

---

### Azure packages (`azure-local-service`, `azure-service-utils`)

| Metric | Value |
|---|---|
| Async Density | **None** |
| **Effection Benefit** | **`*`** |

**Why:** `azure-local-service` is a one-line wrapper around tinylicious. `azure-service-utils` is
pure synchronous JWT generation. No async code at all.

---

### Definition packages

`container-runtime-definitions`, `datastore-definitions`, `runtime-definitions`,
`driver-definitions`, `core-interfaces`, `container-definitions`

| **Effection Benefit** | **`*`** (N/A — types/interfaces only) |

---

## Summary Table

| Package | Async Density | Benefit | Key Reasons |
|---------|:---:|:---:|---|
| **container-runtime** | Very High | `*****` | 132 async fns, 964 awaits, manual cleanup arrays, timers, GC |
| **container-loader** | Very High | `*****` | WebSocket lifecycle, reconnection loops, abort signals |
| **odsp-driver** | Very High | `*****` | Socket pooling w/ ref counting, 1500+ I/O refs, tokens |
| **test-service-load** | High | `****` | Long-running orchestration, fault injection, timer leak |
| **routerlicious-driver** | High | `****` | Empty dispose(), WebSocket, rate limiting |
| **agent-scheduler** | Medium | `***` | No dispose(), quorum listener leak risk |
| **datastore** | Med-High | `***` | Channel lifecycles, deferred loading |
| **dds/tree** | Medium | `***` | Cascading dispose (branches/checkouts/views) |
| **dds/sequence + merge-tree** | Low-Med | `***` | Interval lifecycle, attribution listeners |
| **driver-utils** | Medium | `***` | Retry/throttle utilities, AbortController |
| **devtools-core** | Medium | `***` | Window message handlers, container events |
| **dds/task-manager** | Low-Med | `**` | 19 removeListener calls |
| **dds/map + directory** | Low | `**` | Dispose patterns |
| **local-driver** | Medium | `**` | Clean async, basic cleanup |
| **fluid-static** | Medium | `**` | Container lifecycle wrappers |
| **presence** | Low | `**` | TimerManager abstraction, 26 timer usages |
| **test-utils** | Medium | `**` | Container tracking, memory leak comments |
| **experimental/tree** | Medium | `**` | Heartbeat timer, migration shim |
| **tool-utils** | Medium | `**` | Lock management, HTTP server lifecycle |
| **core-utils** | Low | `*` | Timer/PromiseCache primitives (cascade potential) |
| **cell, counter, matrix** | Low | `*` | Mostly synchronous DDSs |
| **runtime-utils** | Minimal | `*` | Stateless utilities |
| **id-compressor** | None | `*` | Purely synchronous computation |
| **azure/odsp-client** | Low | `*` | High-level wrappers |
| **file-driver** | Low | `*` | Minimal file I/O |
| **azure-local-service** | None | `*` | Tinylicious wrapper |
| **azure-service-utils** | None | `*` | Sync JWT generation |
| **\*-definitions** | N/A | `*` | Types only |

---

## Strategic Recommendation

The highest ROI for introducing effection would be the **"lifecycle spine"** of the framework:

### Phase 1: Establish the Pattern

**Start with `container-loader`** — it's the entry point for all container lifecycles and manages
the most critical resource (the WebSocket connection). Modeling `ConnectionManager` as an effection
`resource()` would establish the pattern.

Concrete mapping:
- `ConnectionManager` -> `resource()` with auto-dispose on scope exit
- Reconnection loop -> `spawn()` with automatic cancellation on disconnect
- `DeltaManager` -> scoped child that auto-halts with container
- AbortController wiring (13 occurrences) -> eliminated by scope cancellation

### Phase 2: Core Runtime

**Then `container-runtime`** — the summarizer, GC, and blob manager subsystems are already
organized as quasi-independent workers. Converting them to `spawn()`-ed tasks within a container
scope would eliminate the manual cleanup arrays.

Concrete mapping:
- `RunningSummarizer` -> `spawn()` background task with `resource()` for timers
- `GarbageCollection` -> `spawn()` with scoped session expiry timers
- `eventsCleanup: (() => void)[]` pattern -> eliminated entirely by scope teardown
- `Deferred` usage (33 instances) -> effection's native task coordination

### Phase 3: I/O Layer

**Then `odsp-driver`** — the socket pool with reference counting is the most fragile resource
management code. An effection resource with scope-based ownership would replace the
`SocketReference` class entirely.

Concrete mapping:
- `SocketReference` with ref counting -> `resource()` with scope ownership
- `OpsCache` with timer-based flushing -> `spawn()` + `sleep()` loop
- Token refresh timers -> `spawn()` background refresh task
- AbortController propagation (25 occurrences) -> scope cancellation

### Phase 4: Foundation Primitives

**`core-utils` Timer/PromiseCache** could be reimplemented as effection primitives, which would
cascade improvements to all packages that use them.

### Lower Priority

The DDSs and test packages are lower priority because their async patterns are simpler and more
localized. The experimental packages and high-level client wrappers delegate their complexity to
the packages above.

---

## Methodology

This analysis was conducted by 7 parallel exploration agents scanning all `.ts` source files
(excluding test files and `.d.ts` where noted) across the client workspace. Each agent searched for:

- `async` function/method declarations
- `.then()` promise chaining
- `new Promise` constructor usage
- `try/catch/finally` blocks around async code
- Resource management patterns: `dispose`, `close`, `cleanup`, `destroy`, `removeListener`,
  `off()`, `removeEventListener`, `finally` blocks
- Timer patterns: `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`
- I/O resource management: WebSocket, HTTP connections, AbortController
- Resource leak indicators: TODO comments, "leak" comments, cleanup warnings

Date: 2026-02-09
