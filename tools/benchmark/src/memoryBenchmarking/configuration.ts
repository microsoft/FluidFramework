/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Callbacks for allocation and deallocation benchmarks/
 * @remarks
 * These are the callbacks that are passed to the benchmark function of a {@link MemoryUseBenchmark}.
 * @public
 */
export interface MemoryUseCallbacks {
	beforeAllocation(): Promise<void>;
	whileAllocated(): Promise<void>;
	afterDeallocation(): Promise<void>;
	continue(): boolean;
}

/**
 * A operation which uses memory in a way that can be measured.
 * @remarks
 * Use with {@link benchmarkMemoryUse} to measure the memory usage of the operation.
 * Only supported in Node.js environments with --expose-gc.
 * @public
 */
export interface MemoryUseBenchmark {
	/**
	 * A function that should loop until `callbacks.continue()` returns false, and in each loop call the callbacks in order:
	 * 1. `callbacks.beforeAllocation()`
	 * 2. Allocate memory in some way.
	 * 3. `callbacks.whileAllocated()`
	 * 4. Deallocate the memory allocated in step 2.
	 * 5. Optionally call `callbacks.afterDeallocation()` to measure deallocation separately from allocation
	 * (the amounts will both be reported, but the mean of them is the primary result).
	 * @remarks
	 * The benchmark will measure memory use inn step 2 and freed in step 4.
	 * A valid use of this function (to avoid errors anc collect accurate data) these amounts should be the same
	 * (memory should not accumulate across iterations).
	 * @privateRemarks
	 * Other schemes (like allowing leaking memory across iterations) could be added as different measurement API / benchmark types if needed.
	 */
	benchmarkFn(state: MemoryUseCallbacks): Promise<void>;

	/**
	 * When set, async garbage collection will be used.
	 * @remarks
	 * Defaults to false.
	 * Enable this to handle cases where a FinalizationRegistry is used and pending finalizers need to be run.
	 * When enabling this, the `await` will leak some memory,
	 * which can be mitigated by using {@link MemoryUseCallbacks.afterDeallocation} as the error to that will cancel out the error for the allocation amount.
	 */
	enableAsyncGC?: boolean;

	/**
	 * Console log the allocated and freed amounts for each test iteration.
	 * @remarks
	 * Defaults to false.
	 * When testing/debugging memory tests, it can be helpful to inspect the actual measured memory use numbers to see if specific iterations are causing issues,
	 * or if there is some exact amount being leaked.
	 */
	logProcessedData?: boolean;

	/**
	 * Console log the raw memory use data for each test iteration.
	 * @remarks
	 * Defaults to false.
	 * When testing/debugging memory tests, it can be helpful to inspect the actual measured memory use numbers to see if specific iterations are causing issues,
	 * or if there is some exact amount being leaked.
	 */
	logRawData?: boolean;

	/**
	 * Override the default number of iterations to run for warmup (which are not included in the results).
	 * @remarks
	 * Only used when {@link isInPerformanceTestingMode} is true.
	 */
	warmUpIterations?: number;

	/**
	 * Override the default number of iterations to run for data collection.
	 * @remarks
	 * Only used when {@link isInPerformanceTestingMode} is true.
	 */
	keepIterations?: number;
}
