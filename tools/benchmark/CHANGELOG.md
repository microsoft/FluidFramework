# @fluid-tools/benchmark

## 0.49.0

Provide @benchmarkCustom feature to log custom measurements. To profile custom usage, define tests using the `benchmarkCustom()` function. The argument `run` to the function includes a reporter with `addMeasurement()`
to write custom data to report.

### ⚠ BREAKING CHANGES

Mocha reporters have been consolidated into a single one that can handle arbitrary properties through `BenchmarkData.customData`, plus `BenchmarkData.customDataFormatters` to specify how each value should be printed to console.
Consumers who previously used `MochaMemoryTestReporter.js` should now use `MochaReporter.js`.

Update `typescript` dependency from `4.x` to `5.x`.
