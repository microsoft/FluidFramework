# @fluid-tools/benchmark

This package contains benchmarking tools to profile runtime and memory usage.
There's the pieces you can use to profile your own code (described below) and various utilities for customizing/configuring
benchmark, as well as authoring alternative reporters and profiling functions (ex: to support test frameworks other than
mocha).

## General use

This package exports `benchmarkIt` which is used instead of mocha's `it()` to define benchmark tests.

The tests you write using `benchmarkIt` will also act as correctness tests.
When you run mocha on a package that contains benchmark tests, they'll behave like any other mocha test defined with `it()`.

To run them as benchmark tests, invoke `mocha` as you normally would for your package but pass some additional arguments,
like this:

```console
--v8-expose-gc --perfMode --fgrep @Benchmark --reporter @fluid-tools/benchmark/dist/MochaReporter.js
```

### `--perfMode` (required)

Indicates that the tests should be run as profiling instead of just correctness tests.
When run like this, many iterations will be run for tests that require it and measured,
but when run as correctness tests only one iteration will be run and no measuring will take place.

### `--v8-expose-gc` (required)

This is necessary so the package can perform explicit garbage collection between tests to help reduce
cross-test contamination and get accurate results for memory tests.

### `--fgrep @Benchmark`

All tests created with the tools in this package get tagged with `@Benchmark` in their name by default, so most of the
time you'll want to use `--fgrep @Benchmark` to only run tests that were defined with the tools provided here.
You can change the `@Benchmark` tag to a few other values (like `@Measurement`, `@Perspective`, or `@Diagnostic`) with
one of the arguments to the functions exposed in this package, and if you do, you can be more specific about which tests
you want to run by passing a different filter, e.g. `--fgrep @Measurement`.

### `--reporter <path>`

Lets you specify the path to a custom reporter to output the tests' results.
This package includes `dist/MochaReporter.js`.
If you don't specify one, the default mocha reporter will take over and you won't see benchmark information.

### `--reporterOptions reportDir=<output-path>`

If you use the reporter from this package, you can configure its output directory with this.

### `--parentProcess`

If you pass this **optional** flag, child processes will be forked for performance tests which support this.
The forked process will run only that test, and propagate the results back to the parent.
This can have significant overhead (the child process reruns mocha test discovery which may incur significant startup cost,
in addition to the overhead of forking NodeJS), but can be used to reduce influences of previous tests on the state of
the JIT and heap.
If you want to use this, you'll want to test it thoroughly in your scenario to make sure the tradeoffs make sense.

## Profiling durations

To profile runtime durations, use `benchmarkIt` together with `benchmarkDuration`:

```typescript
benchmarkIt({
	title: "My sync test",
	...benchmarkDuration({
		benchmarkFn: () => {
			// synchronous code to benchmark
		},
	}),
});

benchmarkIt({
	title: "My async test",
	...benchmarkDuration({
		benchmarkFnAsync: async () => {
			// asynchronous code to benchmark
		},
	}),
});
```

`benchmarkDuration` accepts a `DurationBenchmark`, which must have exactly one of:

-   `benchmarkFn` — a synchronous function to benchmark.
-   `benchmarkFnAsync` — an asynchronous function to benchmark.
-   `benchmarkFnCustom` — an async function that controls the timing loop directly via a `BenchmarkTimer` argument,
    for cases where you need full control over how batches are measured.

It also accepts optional `BenchmarkTimingOptions` to tune `maxBenchmarkDurationSeconds`, `minBatchCount`, and `minBatchDurationSeconds`,
and `HookArguments` (`before`/`after`) for one-time setup and teardown.

Look at the documentation for `DurationBenchmark` and `BenchmarkTimingOptions` for more details.

> **NOTE**: Be wary of gotchas when writing benchmarks for impure functions.
> The test execution strategy presents problems if each iteration of `benchmarkFn` isn't an independent event.
> The problem can be alleviated but not fully fixed using the `beforeEachBatch` option.
> See documentation on `OnBatch` for more detail.

## Profiling custom measurements

To report fully custom measurements, call `benchmarkIt` directly and provide a `run` function that returns a `CollectedData` object:

```typescript
benchmarkIt({
	title: "My custom measurement",
	run: async (timer) => {
		// collect data using timer or any other means
		return {
			primary: {
				name: "My metric",
				value: 42,
				units: "things/op",
				type: ValueType.SmallerIsBetter,
			},
			additional: [],
		};
	},
});
```

Look at the documentation on `CollectedData`, `Measurement`, and `ValueType` for details on what the returned object should contain.

## Profiling memory usage

To profile memory usage, use `benchmarkIt` together with `benchmarkMemoryUse`:

```typescript
benchmarkIt({
	title: "My memory test",
	...benchmarkMemoryUse({
		benchmarkFn: async (state) => {
			let myObject: MyObject | undefined;
			while (state.continue()) {
				await state.beforeAllocation();
				// Allocate memory here.
				myObject = createSomething();
				await state.whileAllocated();
				// Release references to the memory here so it can be reclaimed by GC.
				myObject = undefined;
				await state.afterDeallocation();
			}
			// Use value to make clear to linter and optimizer that assignment to undefined matters.
			assert(myObject === undefined);
		},
	}),
});
```

The argument to `benchmarkMemoryUse` must implement `MemoryUseBenchmark`, which has a single `benchmarkFn` property.
That function receives a `MemoryUseCallbacks` object and must loop until `state.continue()` returns false, calling the
callbacks in order for each iteration:

1.  `state.beforeAllocation()` — GC runs and a baseline "before" heap measurement is taken.
2.  Allocate the memory you want to measure.
3.  `state.whileAllocated()` — GC runs and an "after allocation" heap measurement is taken.
4.  Release references to the memory allocated in step 2 (so it can be reclaimed by GC).
5.  `state.afterDeallocation()` — GC runs and a "after deallocation" heap measurement is taken.

The benchmark measures the difference between the "while allocated" and "before" readings as well as
the difference between "while allocated" and "after deallocation" readings, and reports the mean across iterations.
Memory should not accumulate across iterations (i.e. what you allocate in step 2 should be fully releasable in step 4).

For more details, look at the documentation for `MemoryUseBenchmark` and `MemoryUseCallbacks`.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
