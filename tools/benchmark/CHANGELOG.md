# @fluid-tools/benchmark

## 0.51.0

Provide @benchmarkCustom feature

### ⚠ BREAKING CHANGES

Mocha reporters have been consolidated into a single one that can handle arbitrary properties through `BenchmarkData.customData`, plus `BenchmarkData.customDataFormatters` to specify how each value should be printed to console.
Consumers who previously used `MochaMemoryTestReporter.js` should now use `MochaReporter.js`.

## 0.50.0

### ⚠ BREAKING CHANGES

Update `typescript` dependency from `4.x` to `5.x`.
