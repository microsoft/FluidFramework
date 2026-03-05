# @fluid-tools/benchmark

## 0.53.0

-   Memory benchmarks now have much more aggressive GC to collect more stable results.
-   Geometric mean has been restored to the results summary (was removed in the past) and correctly handles both larger-is-better and smaller-is-better values. This should make evaluating overall impact of changes easier.
-   All benchmarks now have a primary result (included in the geometric mean), and optional additional results.
-   Formatting of console output from reporter has changed.
-   Suites with colliding names now emit a warning and a disambiguation number is added as a suffix.
-   Multiple benchmarks with the same name in the same suite no longer overwrite results, and emit a warning.
-   Include ArrayBuffer memory usage.

### ⚠ BREAKING CHANGES

-   Mocha specific API surface reduced to `benchmarkIt` which can be used to wrap any kind of benchmark for use in mocha. All tests will need to be edited to accommodate this.
-   Naming of types and functions are now clear about duration vs memory: most type imports will need to be updated to accommodate this.
-   Memory benchmarks now require sampling memory before during and after the allocation being measured is retained in memory to allow for the test to know what it's supposed to measure and sanity check that the test is freeing it properly. As this is an entirely different API, all memory tests will need significant changes.
-   Formatting of the output json results files has changed: code consuming them will have to be updated.
-   Reporter now accepts `reportFile` instead of `reportDir`, and saves results to a single file.
-   Reporter now only writes a file if a path was provided: there is no longer a default path.

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
