# @fluid-tools/benchmark

## 0.53.0

-   Memory benchmarks now have much more aggressive GC to collect more stable results.
-   Geometric mean has been restored to the results summary (was removed in the past) and correctly handles both larger is better and smaller is better values. This should make evaluating overall impact of changes easier.
-   All benchmarks now have a primary result (included in the geometric mean), and optional additional results.
-   Formatting of console output from reporter has changed.

### ⚠ BREAKING CHANGES

-   Mocha specific API surface reduced to `benchmarkIt` which can be used to wrap any kind of benchmark for use in mocha. All tests will need to be edited to accommodate this.
-   Naming of types and functions are now clear about duration vs memory: most type imports will need to be updated to accommodate this.
-   Memory benchmarks now require sampling memory before during and after the allocation being measured is retained in memory to allow for the test to know what it's supposed to measure and sanity check that the test is freeing it properly. As this is an entirely different API, all memory tests will need significant changes.
-   Formatting of the output json results files has changed: code consuming them will have to be updated.

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
