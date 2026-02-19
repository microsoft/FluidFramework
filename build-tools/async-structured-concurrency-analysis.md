# Build-Tools Async API Analysis & Effection Structured Concurrency Recommendations

## Effection 4 Overview (for context)

Effection is a structured concurrency library for JavaScript/TypeScript that replaces `async/await` with generator functions (`function*` + `yield*`). Key properties:

| Vanilla JS | Effection |
|---|---|
| `async function` | `function*` |
| `await expr` | `yield* expr` |
| `Promise<T>` | `Operation<T>` |
| `Promise.all()` | `all()` |
| `Promise.race()` | `race()` |
| `new Promise(...)` | `action(function*(resolve) {...})` |
| (nothing) | `spawn()` — structured child tasks |
| (nothing) | `resource()` — lifecycle-managed resources |
| `main().catch(...)` | `main(function*() {...})` — orderly shutdown |

The core value proposition: **when a scope exits (success, error, or cancellation), all spawned children are automatically torn down.** This eliminates leaked resources, dangling processes, and fire-and-forget patterns.

### Key Effection 4 APIs

- **`run(operation)`** — Execute an operation, returns a Task (awaitable + yieldable)
- **`main(operation)`** — Top-level entry point with SIGINT/SIGTERM handling and orderly shutdown
- **`spawn(operation)`** — Run a child operation concurrently, bound to the parent scope
- **`call(operation)`** — Run an operation sequentially in a new scope (scope destroyed on return)
- **`resource(constructor)`** — Create a lifecycle-managed resource with guaranteed cleanup via `provide()`
- **`action(executor)`** — Bridge callback-based APIs into operations (like `new Promise()` but stateless)
- **`sleep(ms)`** — Pause for a duration
- **`suspend()`** — Pause indefinitely until scope ends (used with `try/finally` for cleanup)
- **`ensure(callback)`** — Register guaranteed cleanup when scope ends
- **`race(operations)`** — First to complete wins, losers are halted
- **`all(operations)`** — Wait for all, halt all on any failure
- **`scoped(operation)`** — Explicit scope boundary (new in v4)
- **`useAbortSignal()`** — Scope-bound AbortSignal for integration with fetch, etc.
- **`createSignal<T>()`** — Bridge external callbacks into Effection streams
- **`each(stream)`** — Iterate over a stream with structured concurrency
- **`on(target, event)`** — Create a stream from EventTarget events

---

## Package Rankings (Most → Least Async Complexity)

### 1. `build-tools` (fluid-build) — CRITICAL complexity, HIGHEST effection benefit

**Async surface area:** ~57 source files, worker pools, build graph orchestration, child process management

#### Key Patterns Found

| Pattern | Location | Issue |
|---|---|---|
| Worker pool with threads + child processes | `tasks/workers/workerPool.ts` | No timeout on `once("message")` — can hang forever |
| Fire-and-forget `.then()` | `tasks/workers/worker.ts:60,66` | `messageHandler(message).then(parentPort.postMessage)` — no `.catch()` |
| `Promise.all` for parallel task runs | `buildGraph.ts:428`, `groupTask.ts:95` | Build tasks run concurrently without cancellation support |
| Custom `AsyncPriorityQueue` | `tasks/task.ts` | Queue draining with `await new Promise(setImmediate)` yield pattern |
| `execAsync` wrapping `child_process` | `common/utils.ts:47-68` | Never rejects — errors captured in result object |
| File hash cache promise chains | `fileHashCache.ts:28` | `readFile(path).then(hash)` with no `.catch()` |
| Memory-pressure worker killing | `workerPool.ts:115-137` | Heuristic-based (free mem < 4GB), no task priority awareness |
| Event listener cleanup utility | `workerPool.ts:54-61` | Good pattern: `installTemporaryListener` with cleanup array |
| `uncaughtException`/`unhandledRejection` | `worker.ts:68-79` | Caught in worker process, but `process.exit(-1)` is abrupt |
| Top-level `main().catch()` | `fluidBuild.ts:165-170` | Good, but no SIGINT/SIGTERM handling |

#### Why Effection Would Help Most Here

- **`resource()`** would perfectly model the worker pool lifecycle — workers are created, used, and automatically cleaned up when the build scope ends
- **`spawn()`** for each build task within the build graph scope — if the build is cancelled (Ctrl+C), all spawned tasks and workers tear down automatically
- **`main()`** replaces the manual `main().catch()` + missing signal handlers with built-in orderly shutdown
- The fire-and-forget `.then()` in worker.ts would become a `spawn()` within a structured scope, ensuring errors propagate

#### Concrete Example: Worker Pool as Resource

```typescript
// Current pattern (manual lifecycle)
const workerPool = new WorkerPool();
try {
  await buildGraph.build(workerPool);
} finally {
  workerPool.reset(); // manual cleanup
}

// Effection pattern (automatic lifecycle)
function* workerPoolResource(options): Operation<WorkerPool> {
  return resource(function* (provide) {
    const pool = new WorkerPool(options);
    try {
      yield* provide(pool);
    } finally {
      pool.reset(); // guaranteed cleanup on scope exit
    }
  });
}

main(function* () {
  const pool = yield* workerPoolResource({ concurrency: 8 });
  yield* buildGraph(pool); // Ctrl+C tears down everything
});
```

---

### 2. `build-cli` (flub) — HIGH complexity, HIGH effection benefit

**Async surface area:** 89+ files, oclif command framework, state machines, concurrent package operations

#### Key Patterns Found

| Pattern | Location | Issue |
|---|---|---|
| `async.mapLimit` for concurrent packages | `BasePackageCommand.ts:155-171` | Good error collection, but no cancellation |
| State machine with infinite async loop | `stateMachineCommand.ts:97-146` | `eslint-disable no-await-in-loop` — sequential by design, but no SIGTERM |
| `execa.command()` for subprocess | `commands/exec.ts:28` | `stdio: "inherit"`, `shell: true` — no error handling |
| `Promise.allSettled` for changelogs | `vnext/generate/changelog.ts:89-97` | Good — handles partial failures |
| `Promise.all` for bulk file ops | `repoPolicyCheck/npmPackages.ts:737-751, 1793` | Parallel mkdir/read operations |
| Silent `.catch(() => undefined)` | `npmPackages.ts:750` | Config file errors swallowed |
| Git merge with cleanup in catch | `library/git.ts:301-310` | Good: abort merge on conflict |
| No process signal handlers | Global | Long-running state machines won't gracefully shutdown |
| Retry loop for npm publish | `publish/tarballs.ts:129-161` | Sequential, proper retry, but no timeout |

#### Why Effection Would Help Here

- State machine commands could use `main()` for automatic SIGTERM/SIGINT handling
- `BasePackageCommand.processPackages` could use `spawn()` per package within a structured scope instead of `async.mapLimit` — same concurrency control but with cancellation built in
- The npm publish retry loop would benefit from `race()` with a timeout operation
- Git operations that need cleanup (merge abort) would be cleaner as `resource()` patterns

#### Concrete Example: Package Processing with Structured Concurrency

```typescript
// Current pattern (async.mapLimit)
await async.mapLimit(packages, concurrency, async (pkg) => {
  try {
    await this.processPackage(pkg);
  } catch (error) {
    errors.push(error);
  }
});

// Effection pattern (spawn with structured scope)
function* processPackages(packages, concurrency): Operation<string[]> {
  const errors: string[] = [];
  // Effection's spawn + a semaphore pattern for bounded concurrency
  const tasks = packages.map((pkg) =>
    spawn(function* () {
      try {
        yield* call(async () => processPackage(pkg));
      } catch (error) {
        errors.push(String(error));
      }
    })
  );
  yield* all(tasks);
  return errors;
  // On Ctrl+C: all spawned package processing is automatically halted
}
```

---

### 3. `build-infrastructure` — MODERATE complexity, MODERATE effection benefit

**Async surface area:** ~20 async functions across git ops, version management, workspace installs

#### Key Patterns Found

| Pattern | Location | Issue |
|---|---|---|
| `Promise.all` for parallel saves | `buildProject.ts:286`, `versions.ts:31` | No partial failure handling; reload never runs on rejection |
| `execa` for package manager | `workspace.ts:190` | No timeout, no cancellation, no signal handling |
| Sequential git chains | `git.ts:67-255` | fetch → merge-base → diff, no error handling |
| Unnecessarily async functions | `filter.ts:249`, `package.ts:172`, `commands/list.ts` | `async` keyword with synchronous bodies |
| `.then()` instead of `await` | `packageJsonUtils.ts:106-110` | Inconsistent style |
| Silent catch in tests | `workspace.test.ts:62-66` | `catch { // nothing }` |

#### Why Effection Would Help Here

- **`all()`** would replace `Promise.all` with structured error propagation and cleanup
- `workspace.install()` as a **`resource()`** with automatic timeout/cancellation
- `setDependencyRange` would benefit from structured scoping — the reload step could be in a `finally` equivalent that's guaranteed to run

#### Concrete Example: Safe Parallel Saves

```typescript
// Current pattern (Promise.all, reload skipped on failure)
const savePromises: Promise<void>[] = [];
for (const pkg of packagesToUpdate) {
  savePromises.push(pkg.savePackageJson());
}
await Promise.all(savePromises);
// If any reject, this never runs:
for (const pkg of packagesToUpdate) {
  pkg.reload();
}

// Effection pattern (guaranteed reload)
function* updatePackages(packagesToUpdate): Operation<void> {
  try {
    yield* all(packagesToUpdate.map((pkg) =>
      call(async () => pkg.savePackageJson())
    ));
  } finally {
    // Always runs, even if some saves failed
    for (const pkg of packagesToUpdate) {
      pkg.reload();
    }
  }
}
```

---

### 4. `bundle-size-tools` — LOW complexity, LOW effection benefit

**Async surface area:** Minimal — Webpack plugin with `tapAsync` callback, synchronous file I/O

#### Key Patterns Found

| Pattern | Location | Issue |
|---|---|---|
| Webpack `tapAsync` callback | `BundleBuddyConfigWebpackPlugin.ts:36-75` | Standard plugin pattern, callback-based |
| Synchronous fs operations | Throughout | `existsSync`, `mkdirSync`, `writeFileSync` |
| `execSync` for git commands | `gitCommands.ts:6-18` | Blocks event loop, no error handling |
| `Promise.all` for config loading | `getBundleBuddyConfigMap.ts:15-34` | No error handling on the Promise.all |
| Nested `Promise.all` for bundles | `getBundleSummaries.ts:28-52` | Good parallelization |
| Stream-to-buffer with events | `unzipStream.ts:9-27` | Proper error/close handlers, but no timeout |
| ADO fallback loop | `AdoSizeComparator.ts:89-201` | Complex state, `.catch(() => undefined)` error suppression |

#### Why Effection Isn't Particularly Helpful

This package does almost no async work. It's mostly synchronous data processing (webpack stats analysis) with a callback-based webpack plugin API that isn't easily replaceable. The ADO integration code could benefit marginally, but the scope is small.

---

### 5. `version-tools` — MINIMAL complexity, NO effection benefit

**Async surface area:** Only oclif command boilerplate (`async run()`, `await this.parse()`)

#### Key Patterns Found

| Pattern | Location | Issue |
|---|---|---|
| oclif `async run()` | `commands/version.ts:91`, `commands/version/latest.ts:53` | Standard framework pattern |
| Entry point IIFE | `bin/run.js:8-11` | `(async () => { await oclif.execute() })()` |
| `execSync` for git tags | `versions.ts:173` | No error handling |

#### Why Effection Isn't Helpful

This is essentially a synchronous library (semver manipulation) wrapped in oclif's async command infrastructure. There's nothing to manage or clean up.

---

## Summary Ranking

| Rank | Package | Async Complexity | Effection Benefit | Key Opportunity |
|:---:|---|:---:|:---:|---|
| **1** | `build-tools` | Critical | **Highest** | Worker pool lifecycle, build task graph, process cleanup, signal handling |
| **2** | `build-cli` | High | **High** | State machine commands, concurrent package processing, subprocess management |
| **3** | `build-infrastructure` | Moderate | **Moderate** | Parallel save operations, package manager subprocess management |
| **4** | `bundle-size-tools` | Low | **Low** | Nearly all synchronous; webpack callback API not a good fit |
| **5** | `version-tools` | Minimal | **None** | Pure computation, no async to manage |

---

## Cross-Cutting Issues Found Across All Packages

### No Signal Handling Anywhere

None of the five packages handle SIGINT or SIGTERM. This means:
- Long-running builds (`build-tools`) can't clean up workers on Ctrl+C
- State machine commands (`build-cli`) can't persist state on termination
- Package manager installs (`build-infrastructure`) can't abort cleanly

Effection's `main()` solves this universally.

### No Cancellation/Timeout Support

No package uses `AbortController`, `AbortSignal`, or timeout mechanisms. This means:
- Worker messages can hang forever (`build-tools`)
- `execa` subprocesses can hang forever (`build-infrastructure`, `build-cli`)
- ADO API calls can hang forever (`bundle-size-tools`)

Effection's `useAbortSignal()` and `race()` with `sleep()` solve this.

### Inconsistent Error Handling on Concurrent Operations

- `build-tools`: Fire-and-forget `.then()` in worker message handlers
- `build-cli`: `.catch(() => undefined)` swallowing config read errors
- `build-infrastructure`: `Promise.all` with no partial failure handling
- `bundle-size-tools`: `.catch()` converting errors to undefined in ADO comparator

Effection's structured error propagation (errors in children propagate to parents) eliminates these patterns.

---

## Top Effection Adoption Recommendations

### Highest-Impact Opportunities (build-tools)

1. **Worker Pool as a `resource()`** — The worker pool (`workerPool.ts`) creates/manages/destroys thread workers and child processes. As an effection resource, workers would automatically terminate when the build scope ends, eliminating the manual `reset()` calls and the missing SIGTERM cleanup.

2. **Build Graph tasks as `spawn()`** — `buildGraph.ts` pushes tasks into `Promise.all` arrays. With effection, each task could be `spawn()`-ed within the build scope. Cancelling the build (Ctrl+C) would automatically cancel all running tasks and their subprocess children.

3. **`main()` for entry points** — Both `fluidBuild.ts` and oclif bin scripts use `main().catch()`. Effection's `main()` provides orderly shutdown with SIGINT/SIGTERM handling for free.

### High-Impact Opportunities (build-cli)

4. **`BasePackageCommand.processPackages` with structured concurrency** — Replace `async.mapLimit` with a spawning pattern that provides the same bounded concurrency but adds cancellation and automatic cleanup when the command exits.

5. **State machine lifecycle** — `StateMachineCommand` runs an infinite async loop. Wrapping this in effection's `main()` gives free signal handling and ensures all async operations in each state are cleaned up when transitioning.

6. **Subprocess management** — Every `execa` call could be wrapped as a `resource()` that kills the child process on scope exit, eliminating the class of bugs where subprocesses outlive their parent context.

### Moderate-Impact Opportunities (build-infrastructure)

7. **Parallel saves with guaranteed reload** — `setDependencyRange()` and `setVersion()` use `Promise.all` followed by a reload loop that's skipped on failure. Effection's `try/finally` within a structured scope guarantees the reload always runs.

8. **Package manager install with timeout** — `workspace.install()` spawns npm/pnpm/yarn with no timeout. As an effection operation, it could use `race()` with `sleep()` to add timeout, and `useAbortSignal()` to pass cancellation to the subprocess.

---

## Migration Strategy

If adopting effection, the recommended order would be:

1. **Start with `build-tools`** — highest ROI, most complex async patterns, most bugs to fix
2. **Then `build-cli`** — high ROI, builds on patterns established in build-tools
3. **Then `build-infrastructure`** — moderate ROI, straightforward conversions
4. **Skip `bundle-size-tools` and `version-tools`** — not worth the migration cost

Within each package, start with the entry points (`main()` adoption) and work inward toward the most complex async patterns (worker pools, build graphs, state machines).
