# @fluid-tools/benchmark

This package contains benchmarking tools to profile runtime and memory usage.
It provides the tools you need to profile your own code (described below) and various utilities for customizing and configuring
benchmarks, as well as authoring alternative reporters and profiling functions (e.g. to support test frameworks other than
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

Enables performance-testing mode instead of correctness-test mode.
In performance-testing mode, many iterations are run and measured for each test.
In correctness-test mode, only one iteration is run and no measurement takes place.

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

### `--reporterOptions reportFile=<output-path>`

If you use the reporter from this package, you can set the output file path with this.
All benchmark results are combined into a single JSON file using a hierarchical `ReportArray` structure.
If omitted, no file is written (results are still printed to the console).

### `--parentProcess`

If you pass this **optional** flag, each performance test is run in a forked child process.
The forked process runs only that test and propagates the results back to the parent.
This can have significant overhead (the child process reruns mocha test discovery which may incur significant startup cost,
in addition to the overhead of forking NodeJS), but reduces influences of previous tests on the state of
the JIT and heap.
Test this thoroughly in your scenario to make sure the tradeoffs are worthwhile.

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
-   `benchmarkFnCustom` — an async function that manages the batching loop directly via a `BenchmarkTimer` argument,
    for cases where you need full control over timing. Use `state.timeBatch(fn)` for the common case, or
    `state.timer.now()` / `state.recordBatch()` when you need to exclude setup/teardown from the measured time.

It also accepts optional `BenchmarkTimingOptions` to tune `maxBenchmarkDurationSeconds`, `minBatchCount`, and `minBatchDurationSeconds`.

Look at the documentation for `DurationBenchmark` and `BenchmarkTimingOptions` for more details.

> **NOTE**: Be wary of gotchas when writing benchmarks for impure functions.
> The test execution strategy presents problems if each iteration of `benchmarkFn` isn't an independent event.
> For full control over per-batch setup and teardown, use `benchmarkFnCustom`.
> See documentation on `DurationBenchmarkCustom` for more detail.

## Profiling custom measurements

To report fully custom measurements, call `benchmarkIt` directly and provide a `run` function that returns a `CollectedData`:

```typescript
benchmarkIt({
	title: "My custom measurement",
	run: (): CollectedData => [
		{
			// The first element is the primary measurement (all fields required).
			name: "My metric",
			value: 42,
			units: "things/op",
			type: ValueType.SmallerIsBetter,
		},
		// Additional measurements are optional.
		{
			name: "Sample count",
			value: 100,
			units: "count",
		},
	],
});
```

`CollectedData` is a tuple `[PrimaryMeasurement, ...Measurement[]]`. The first element is the primary measurement (used for regression detection) and requires all fields including `units` and `type`. Additional measurements are optional and their fields `units` and `type` are optional too.

`collectDurationData` and `collectMemoryUseData` can be called directly within the `run` function, which is more flexible than `benchmarkDuration` or `benchmarkMemoryUse` when you need to add custom measurements or run setup/teardown outside the timed region:

```typescript
benchmarkIt({
	title: "My custom duration measurement",
	run: async (): Promise<CollectedData> => {
		// Optional setup can run here
		const data = await collectDurationData({
			benchmarkFn: () => {
				// code to benchmark
			},
		});
		// Extra measurements can be added:
		return [...data, { name: "Extra metric", value: 1 }];
	},
});
```

## Profiling memory usage

To profile memory usage, use `benchmarkIt` together with `benchmarkMemoryUse`:

```typescript
benchmarkIt({
	title: "My memory test",
	...benchmarkMemoryUse({
		benchmarkFn: async (state) => {
			// If your test requires one-time setup, do it here:
			const holder: { value: unknown } = { value: undefined };
			while (state.continue()) {
				// Release the previous allocation, then do any per-iteration setup.
				holder.value = undefined;
				// Collect a baseline "before" heap measurement.
				await state.beforeAllocation();
				// Allocate the memory you want to measure.
				holder.value = createSomething();
				// Collect an "after allocation" heap measurement.
				await state.whileAllocated();
				// To help confirm you are measuring the allocation you expect,
				// you can optionally free it here then call afterDeallocation:
				// holder.value = undefined;
				// await state.afterDeallocation();
			}
		},
	}),
});
```

This measures the difference in the retained portion of the heap from `beforeAllocation` to `whileAllocated`.
This does not include memory which was used during the operation but released before `whileAllocated` was called.

The argument to `benchmarkMemoryUse` must implement `MemoryUseBenchmark`, which requires a `benchmarkFn` property.
That function receives a `MemoryUseCallbacks` object and must loop until `state.continue()` returns false, following
this pattern each iteration:

1.  Release references to any memory allocated in the previous iteration (so GC can reclaim it).
2.  Set up anything needed to do the allocation under test that should not be included in the measurement.
3.  `state.beforeAllocation()` — GC runs and a baseline "before" heap measurement is taken.
4.  Do the operation whose memory allocation you want to measure.
5.  `state.whileAllocated()` — GC runs and an "after allocation" heap measurement is taken.
6.  _(Optional)_ Free memory, then call `state.afterDeallocation()` — if called, GC runs and an "after deallocation" heap measurement is taken as well.

The benchmark reports the mean heap difference between the "while allocated" and "before" readings across iterations.
Memory must not accumulate across iterations (i.e. what you allocate in step 4 must be fully releasable).

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
