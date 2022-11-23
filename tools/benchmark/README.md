# @fluid-tools/benchmark

This package contains benchmarking tools to profile runtime and memory usage.
There's the pieces you can use to profile your own code (described below) and various utilities for customizing/configuring
benchmark, as well as authoring alternative reporters and profiling functions (ex: to support test frameworks other than
mocha).

## General use

This package exports a few functions that you'll use instead of mocha's `it()` to define profiling tests:

- `benchmark()` for runtime tests
- `benchmarkMemory()` for memory usage tests

More details particular to each can be found in the sections below.

The tests you write using these functions can also act as correctness tests. When you run mocha on a package that contains
profiling tests, they'll behave like any other mocha test defined with `it()`.

To run them as profiling tests, invoke `mocha` as you normally would for your package but pass some additional arguments,
like this:

```console
--expose-gc --perfMode --fgrep @Benchmark --fgrep @ExecutionTime --reporter @fluid-tools/benchmark/dist/MochaReporter.js
```

### `--perfMode` (required)

Indicates that the tests should be run as profiling instead of just correctness tests.
When run like this, many iterations will be run and measured, but when run as correctness tests only one iteration
will be run and no measuring will take place.

### `--expose-gc` (required)

This is necessary so the package can perform explicit garbage collection between tests to help reduce
cross-test contamination.

### `--fgrep @Benchmark`

All tests created with the tools in this package get tagged with `@Benchmark` in their name, so most of the time you'll
want to use `--fgrep @Benchmark` to only run tests that were defined with the tools provided here.
You can be more specific and only run tests with a particular tag, which you might set or provide when writing the tests,
e.g. `--fgrep @Measurement`.

### `--fgrep @ExecutionTime` or `--fgrep @MemoryUsage`

You'll also want to use one of these to only run execution-time/runtime or memory usage tests.
You can technically run them both at the same time, but the custom mocha reporters (one for runtime tests, one for memory
usage tests) expect to only see tests of their corresponding type, so in order to use those you'll have to use `--fgrep`
as described here and do two separate test runs, one for each type of test.

### `--reporter <path>`

Lets you specify the path to a custom reporter to output the tests' results.
This package includes `dist/MochaReporter.js` for runtime tests, and `dist/MochaMemoryTestReporter.ts` for memory usage tests.
If you don't specify one, the default mocha reporter will take over and you won't see profiling information.

### `--reporterOptions reportDir=<output-path>`

If you use a custom reporter from this package, you can configure its output directory with this.

### `--parentProcess`

If you pass this **optional** flag, child processes will be forked for each profiling test, where only that test will run.
This can have significant overhead (the child process reruns mocha test discovery which may incur significant startup cost,
in addition to the overhead of forking NodeJS), but can be used to reduce influences of previous tests on the state of
the JIT and heap.
If you want to use this, you'll want to test it thoroughly in your scenario to make sure the tradeoffs make sense.

## Profiling runtime

To profile runtime, define tests using the `benchmark()` function.
The object you pass as the single parameter lets you set a title for the test


When ran, the tests will be tagged with `@Benchmark` (or whatever you pass in `BenchmarkOptions.type` when defining
a test) and `@ExecutionTime` (as opposed to `@MemoryUsage` for memory profiling tests).



See `BenchmarkType` for more information.

## Profiling memory usage

The `benchmarkMemory()` function tags its tests with `@Benchmark` (or whatever you pass in `BenchmarkOptions.type` when defining
a test) and `@ExecutionTime` (as opposed to `@MemoryUsage` for memory profiling tests).

```

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
