# @fluid-tools/benchmark

## 0.51.0

-   `BenchmarkTimer` (provided to `CustomBenchmark.benchmarkFnCustom`) now has a `timeBatch` utility to simplify its use in the common cases.
-   `CustomBenchmark.benchmarkFnCustom` how has documentation.


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
