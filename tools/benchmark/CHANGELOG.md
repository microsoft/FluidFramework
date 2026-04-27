# @fluid-tools/benchmark

## 0.59.0

-   Added `BenchmarkMode` enum with `Correctness` and `Performance` values to represent the mode in which benchmarks are run.
-   Added `currentBenchmarkMode` constant that reflects the active `BenchmarkMode` at process startup (determined by `--perfMode` flag or `FLUID_TEST_PERF_MODE` environment variable).
-   `isInPerformanceTestingMode` is now deprecated. Use `currentBenchmarkMode === BenchmarkMode.Performance` instead.
-   Added `MochaBenchmarkOptions` as the options type for `benchmarkIt`, replacing `BenchmarkOptions`. It adds:
    -   `correctnessTimeoutMs?: number` — sets the Mocha timeout for this test when running in `BenchmarkMode.Correctness`. Useful for extending correctness-mode timeouts without affecting the (typically much longer) performance-mode timeouts.
    -   `skip?: BenchmarkMode | true` — skips this test. When set to `true`, the test is skipped in all modes. When set to a `BenchmarkMode` value, the test is skipped only in that mode.
    -   `only?: boolean` — restricts the run to this test (equivalent to Mocha's `it.only`).
-   Added `benchmarkDurationBatchless` and the `BatchlessDurationTimer` interface for benchmarks that require per-iteration setup and/or teardown, making batching impractical. Each timed sample covers exactly one invocation of the operation. Prefer `benchmarkDuration` with batching when possible, as batchless measurements have significantly higher noise and measurement bias.
    Tests previously using `minBatchDurationSeconds: 0` to force a single iteration per batch should migrate to this API.
-   Improved error reporting: if a benchmark function exits before data collection is complete (e.g. by never recording timing data via the relevant API, such as `state.timeBatch()`/`state.recordBatch()` for custom duration benchmarks or `time()`/`timeAsync()` for batchless benchmarks, or by breaking out of the timing loop while it is still returning `true`), an error is now thrown with a descriptive message.

### ⚠ BREAKING CHANGES

-   `BenchmarkTimer` has been renamed to `BatchedDurationTimer`.
-   Removed `MochaExclusiveOptions` interface. Consumers who referenced this type should use `MochaBenchmarkOptions` instead, which includes the same `only` field plus the new `correctnessTimeoutMs` and `skip` options.

## 0.58.0

-   Default value for `BenchmarkDescription.type` is now documented to be `BenchmarkType.Measurement` (no functional change: just added missing documentation).
-   Added `timeBatchAsync` and `timeAllBatchesAsync` methods to `BenchmarkTimer` for benchmarking async operations via `DurationBenchmarkCustom`.
-   Recommend use of `benchmarkDuration` in dcoumentation for `collectDurationData`.
-   Suggest setting `testType: TestType.ExecutionTime` when using `collectDurationData` in a `BenchmarkFunction`.

### ⚠ BREAKING CHANGES

-   Removed deprecated `benchmark` and `benchmarkCustom` functions. Use `benchmarkIt` with `benchmarkDuration` instead.
-   Removed deprecated `HookArguments` interface and its `before`/`after` fields from `DurationBenchmarkSync` and `DurationBenchmarkAsync`. Use `DurationBenchmarkCustom` or call `collectDurationData` directly from a wrapper function containing setup/teardown.
-   Removed deprecated `OnBatch` interface and its `beforeEachBatch` field from `DurationBenchmarkSync` and `DurationBenchmarkAsync`. Use `DurationBenchmarkCustom` for per-batch setup.
-   Removed deprecated `HookFunction` type.

## 0.57.0

-   Mocha dependency updated from v10 to v11.
-   Error messages from Mocha, including timeouts, are now included in the console and output files properly.

## 0.56.0

-   Add `after` to `MemoryUseModifier`.

## 0.55.0

-   Added `memoryUseOfValue` and `memoryAddedBy` helper functions for constructing common `MemoryUseBenchmark` cases without hand-writing the callback loop.
-   Added `Box<T>`, a simple optional-value container useful for controlling object lifetime in memory benchmarks when stack variable lifetimes would otherwise retain memory longer than intended.
-   `MemoryUseBenchmark.enableAsyncGC` now defaults to `true`. Benchmarks that do not require async GC can set `enableAsyncGC: false` to avoid the small runtime and per-iteration memory overhead it introduces.

## 0.54.0

-   Fixed `--parentProcess` mode incorrectly matching tests whose full title is a substring of another test's full title. The child process filter now uses an exact-match regex (`--grep ^title$`) instead of substring matching (`--fgrep title`). For example, if a suite contained tests named `foo` and `foobar` in the same suite, running `foo` in a child process with `--fgrep foo` would also match `foobar`, causing both tests to run and assuming both are benchmarks, produce an error (versions prior to 0.53 would produce incorrect results instead of an error).

## 0.53.0

-   Memory benchmarks now have much more aggressive GC to collect more stable results.
-   Geometric mean has been restored to the results summary (was removed in the past) and correctly handles both larger-is-better and smaller-is-better values. This should make evaluating overall impact of changes easier.
-   All benchmarks now have a primary result (included in the geometric mean), and optional additional results.
-   Formatting of console output from reporter has changed.
-   Suites with colliding names now emit a warning and a disambiguation number is added as a suffix.
-   Multiple benchmarks with the same name in the same suite no longer overwrite results, and emit a warning.
-   Include ArrayBuffer memory usage.
-   New `benchmarkDuration` and `benchmarkMemoryUse` helpers cover the common mocha use cases for duration and memory benchmarks respectively.
-   `benchmark` and `benchmarkCustom` are still exported but are now considered legacy; prefer `benchmarkIt` or the new typed helpers.
-   Console output been cleaned up, especially for errors. Errors are now printed in full once, and a truncated version included in the table. Previously they were printed in full three times, including once in the table.
-   When using `--parentProcess`, the test duration is collected for both the parent and child process: previously only the parent process collected this data.
-   Top level tests (outside of any describe block) are now handled correctly.
-   FLUID_TEST_PERF_MODE environment variable can be used instead of --perfMode.
-   Mocha parallel mode now works as long as you use the FLUID_TEST_PERF_MODE environment variable instead of --perfMode and do not use --parentProcess.

### ⚠ BREAKING CHANGES

-   Mocha specific API surface reduced to `benchmarkIt` which can be used to wrap any kind of benchmark for use in mocha. Most tests will need to be edited to accommodate this. Some limited support for the old APIs have been kept as deprecated functions.
-   `BenchmarkData` and `CustomData` have been removed. Use `CollectedData` and `Measurement` instead.
-   Duration benchmark argument types have been renamed: `BenchmarkArguments` → `DurationBenchmark`, `BenchmarkSyncArguments` → `DurationBenchmarkSync`, `BenchmarkAsyncArguments` → `DurationBenchmarkAsync`, `CustomBenchmark` / `CustomBenchmarkArguments` → `DurationBenchmarkCustom`.
-   `runBenchmark` has been renamed to `collectDurationData`. It now returns `CollectedData` instead of `BenchmarkData`.
-   `captureResults` now runs the callback instead of returning a wrapper around it.
-   Memory benchmarks now require sampling memory before during and after the allocation being measured is retained in memory to allow for the test to know what it's supposed to measure and sanity check that the test is freeing it properly. As this is an entirely different API, all memory tests will need significant changes.
-   Formatting of the output json results files has changed: code consuming them will have to be updated.
    The new format includes failing tests (with their error messages) as well as the full hierarchal structure and can represent multiple tests and suites with the same qualified name.
    See `ReportArray` type for format for the contents of the report.
-   `isResultError`, `prettyNumber`, `geometricMean`, and `Stats` are no longer exported from the package.
-   Reporter now accepts `reportFile` instead of `reportDir`, and saves results to a single JSON file.
-   Reporter now only writes a file if a path was provided: there is no longer a default path.
-   `MochaReporter` is now provided at `@fluid-tools/benchmark/dist/mocha/Reporter.js` instead of `@fluid-tools/benchmark/dist/MochaReporter.js`
-   Report JSON files now include error results alongside passing results. `ReportEntry.data` is `BenchmarkResult`, which may be either `CollectedData` or `BenchmarkError`.
-   The APIs for writing reporters have been refactored significantly. If updating a reporter, review how the [updated Mocha reporter](./src/mocha/Reporter.ts) works.

## 0.52.0

-   Removed the production dependency on `chai`. The package now uses a minimal internal assertion utility instead.
-   Fixed an issue where the "benchmark end" event was not emitted if an error was thrown by the runner.

## 0.51.0

-   `BenchmarkTimer` (provided to `CustomBenchmark.benchmarkFnCustom`) now has a `timeBatch` utility to simplify its use in the common cases.
-   `CustomBenchmark.benchmarkFnCustom` how has documentation.
-   `benchmarkMemory` now supports memory regression tests via `baselineMemoryUsage` and `allowedDeviationBytes`.
-   Tests fail on memory regression when `ENABLE_MEM_REGRESSION` is `true`l otherwise

## 0.50.0

-   Fixes the time execution test to have correct key-value pairs to avoid logging `undefined`.
-   Removes `customDataFormatters` in the log output files.
-   Unifies the logging format for time execution and memory tests.

## 0.49.0

Adds a feature to run benchmarks that log custom measurements. To use it, define tests using the `benchmarkCustom()` function. The `run` argument passed to the function is itself a function that will get passed a reporter object with an `addMeasurement()` method, that the test code can use to define custom data to report as the benchmark output. These custom-measurement benchmarks get the string `@CustomBenchmark` appended to their title, so they can be run selectively using `mocha`'s `fgrep` flag (e.g., @Benchmark, @CustomBenchmark, @MemoryUsage)

### ⚠ BREAKING CHANGES

Mocha reporters have been consolidated into a single one that can handle arbitrary properties through `BenchmarkData.customData`, plus `BenchmarkData.customDataFormatters` to specify how each value should be printed to console.
Consumers who previously used `MochaMemoryTestReporter.js` should now use `MochaReporter.js`.

Update `typescript` dependency from `4.x` to `5.x`.

### 0.48

This release focuses on improving the ability to use this package in more environments.
It should now be practical to run at least correctness mode tests in browsers and import whats needed to write simple test runners for other testing frameworks like Jest.

-   [Fix qualifiedTitle generation to not insert a seperator when the catagory is `undefined`](https://github.com/microsoft/FluidFramework/commit/81df3860477fa2c968049321b3faf1434e57618e#diff-5f5a68acdfe610a22efc6bf398106145e0002f517d5a01293d2a6c8c94bd5525)
-   [Remove Top Level Platform Specific Imports](https://github.com/microsoft/FluidFramework/commit/50bf0781cc977213a2b24510da76e0ebff816a09)
-   [Package export `qualifiedTitle` and `runBenchmark`](https://github.com/microsoft/FluidFramework/commit/32d2397be72ed737a4d151686021fb708cfb3271)

### 0.47

In this version the largest change was [Use custom benchmarking code instead of Benchmark.js](https://github.com/microsoft/FluidFramework/commit/a282e8d173b365d04bf950b860b1342ebcb1513e).
This included using more modern timing APIs, a new measurement inner loop, removal of all code generation, non-callback based async support and much more.
This change is likely to have slight impact on times reported from benchmarks:
across a large suite of benchmarks the new version seems to be about 2% faster results (based on geometric mean), perhaps due to more efficient JITing of the much more modern JavaScript and lower timing overhead from the newer APIs.
Another significant change was [Use Chalk](https://github.com/microsoft/FluidFramework/commit/996102fcf2bbbfb042c7a504d62708b7ca19f72c) which improved how formatting (mainly coloring) of console output was done.
The reporter now auto detects support from the console and thus will avoid including formatting escape sequences when redirecting output to a file.

Breaking Changes:

-   `onCycle` renamed to `beforeEachBatch`.
-   Many renames and a lot of refactoring unlikely to impact users of the mocha test APIs, but likely to break more integrated code, like custom reporters.
