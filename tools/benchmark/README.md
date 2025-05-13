# @fluid-tools/benchmark

This package contains benchmarking tools to profile runtime and memory usage.
There's the pieces you can use to profile your own code (described below) and various utilities for customizing/configuring
benchmark, as well as authoring alternative reporters and profiling functions (ex: to support test frameworks other than
mocha).

## General use

This package exports a few functions that you'll use instead of mocha's `it()` to define profiling tests:

-   `benchmark()` for runtime tests
-   `benchmarkCustom()` for custom usage tests
-   `benchmarkMemory()` for memory usage tests

More details particular to each can be found in the sections below.

The tests you write using these functions can also act as correctness tests. When you run mocha on a package that contains
profiling tests, they'll behave like any other mocha test defined with `it()`.

To run them as profiling tests, invoke `mocha` as you normally would for your package but pass some additional arguments,
like this:

```console
--v8-expose-gc --perfMode --fgrep @Benchmark --fgrep @ExecutionTime --reporter @fluid-tools/benchmark/dist/MochaReporter.js
```

### `--perfMode` (required)

Indicates that the tests should be run as profiling instead of just correctness tests.
When run like this, many iterations will be run and measured, but when run as correctness tests only one iteration
will be run and no measuring will take place.

### `--v8-expose-gc` (required)

This is necessary so the package can perform explicit garbage collection between tests to help reduce
cross-test contamination.

### `--fgrep @Benchmark`

All tests created with the tools in this package get tagged with `@Benchmark` in their name by default, so most of the
time you'll want to use `--fgrep @Benchmark` to only run tests that were defined with the tools provided here.
You can change the `@Benchmark` tag to a few other values (like `@Measurement`, `@Perspective`, or `@Diagnostic`) with
one of the arguments to the functions exposed in this package, and if you do, you can be more specific about which tests
want to run by passing a different filter, e.g. `--fgrep @Measurement`.

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
The `BenchmarkArguments` object you pass as argument lets you configure several things about the test, the most important
ones being a title and the code that the test should run. It's important that you use the correct property to define your
test code, depending on if it's fully synchronous (use `benchmarkFn`) or asynchronous (use `benchmarkFnAsync`).

Look at the documentation for `BenchmarkArguments` for more details on what the rest of its properties do.

When run, tests for runtime profiling will be tagged with `@Benchmark` (or whatever you pass in `BenchmarkOptions.type`
when you define the test) and `@ExecutionTime` (as opposed to `@MemoryUsage` for memory profiling tests).

> **NOTE**: Be wary of gotchas when writing benchmarks for impure functions.
> The test execution strategy presents problems if each iteration of `benchmarkFn` isn't an independent event.
> The problem can be alleviated but not fully fixed using the `onCycle` hook argument.
> See documentation on `HookArguments` for more detail.

## Profiling custom usage

To customize profiling, define tests using the `benchmarkCustom()` function. The run argument of this function
includes a reporter that uses `addMeasurement()` to record custom data for reporting. Look at the documentation
on `Titled`, `BenchmarkDescription`, `MochaExclusiveOptions` for more details on what the rest of its properties do.

## Profiling memory usage

To profile memory usage, define tests using the `benchmarkMemory()` function.
The single argument to the function must be an **instance of a class** that implement `IMemoryTestObject`.
This leads to some uncommon ways of writing tests and might feel strange, but it was done this way to try to ensure
that these tests are written in a way in which they can obtain accurate measurements and not run into problems because
of cross-test contamination, which are very easy to run into when trying to profile memory usage.

A high-level explanation of how memory profiling tests execute might help make this clearer:

For each test:

1.  The `before()` method in the class instance is called.
2.  The `beforeIteration()` method in the class instance is called.
3.  Garbage Collection is triggered.
4.  We collect a baseline "before" memory measurement.
5.  The `run()` method in the class instance is called.
6.  The `afterIteration()` method in the class instance is called.
7.  Garbage Collection is triggered.
8.  We collect an "after" memory measurement.
9.  Repeat steps 2-9 until some conditions are met.
10. The `after()` method in the class instance is called.

In general terms, this means you should:

-   Put code that sets up the test but should _not_ be included in the baseline "before" memory measurement, in the
    `beforeIteration()` method.
-   Put test code in the `run()` method, and ensure that things that need to be considered in the "after" memory measurement
    are assigned to local variables declared _outside_ of the `run()` method, so they won't go out of scope as soon as
    the method returns, and thus are not collected when GC runs in step 7 above.

    Technically, those variables could be declared outside the class, but that is prone to cross-test contamination.
    Private variables declared inside the class (which in a way "represents" the test), should make it clear that they are
    only relevant for that test, and help avoid cross-contamination because the class instance will be out of scope (and
    thus garbage-collectable) by the time the next test executes.

The pattern most memory tests will want to follow is something like this (note the `()` after the test declaration
to immediately instantiate it):

```typescript
benchmarkMemory(
	new (class implements IMemoryTestObject {
		title = `My test title`;
		private someLocalVariable: MyType | undefined;

		beforeIteration() {
			// Code that sets up the test but should *not* be included in the baseline "before" memory measurement.
			// For example, clearing someLocalVariable to set up an "empty state" before we take the first measurement.
		}

		async run() {
			// The actual code that you want to measure.
			// For example, creating a new object and assigning it to someLocalVariable.
			// Since someLocalVariable belongs to the class instance, which isn't yet out of scope after this method returns,
			// the memory allocated into the variable will be "seen" by the "after" memory measurement.
		}
	})(),
);
```

When ran, tests for memory profiling will be tagged with `@Benchmark` (or whatever you pass in `IMemoryTestObject.type`
when you define the test) and `@MemoryUsage` (as opposed to `@ExecutionTime` for runtime profiling tests).

For more details, look at the documentation for `IMemoryTestObject`.

## Release Notes

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
