# @fluid-tools/benchmark

This package contains Benchmarking tools.
Includes:

-   `dist/MochaReporter.js`: mocha reporter which when running performance tests generates friendly human readable console output and `.json` files from benchmark results.
-   `benchmark` function which can be used to make a mocha test which functions as both a correctness test and a benchmark.
-   various utilities for customizing/configuring benchmark, as well as authoring alternative reporters and benchmark functions (ex: to support test frameworks other than mocha).

To run benchmarks defined using these tools, invoke mocha normally, but add the following arguments:

> `--expose-gc --perfMode --fgrep @Benchmark --reporter @fluid-tools/benchmark/dist/MochaReporter.js`

To configure the reporter output directory, you can add `--reporter-options reportDir=./benchmarks`

To filter to a specific `BenchmarkType` such as `Measurement` you can use it as the `--fgrep` instead:

> `--expose-gc --perfMode --fgrep @Measurement --reporter @fluid-tools/benchmark/dist/MochaReporter.js`

`--expose-gc` allows for explicit garbage collection between tests to help reduce contamination across tests.

`--perfMode` runs the tests as benchmarks instead of correctness tests. When run as benchmarks, many iterations will be run and timed, but when run as correctness tests only one iteration will be run, and no timing will be done.

`--parentProcess` (optional) causes child processes to be forked for each benchmark, which will just run the individual test.
This can have significant overhead (the child process reruns mocha test discovery which may incur significant startup cost, in addition to the overhead of forking NodeJS), but can be used to reduce influences of previous tests on the state of the Jit and heap.

The `benchmark` function tags its tests with `@Benchmark` as well as the benchmark type (for example `@Measurement`). These can be used to filter to just benchmarks using the mocha `--fgrep` option.
See `BenchmarkType` for more information.

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
