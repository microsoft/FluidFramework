/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Callbacks for allocation and deallocation benchmarks.
 * @remarks
 * These are the callbacks that are passed to the benchmark function of a {@link MemoryUseBenchmark}.
 * @public
 * @sealed
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
 * @input
 */
export interface MemoryUseBenchmark {
	/**
	 * A function that should loop until `state.continue()` returns false, and in each loop call the callbacks in order:
	 * 1. `state.beforeAllocation()`
	 * 2. Allocate memory in some way.
	 * 3. `state.whileAllocated()`
	 * 4. Deallocate the memory allocated in step 2.
	 * 5. Optionally call `state.afterDeallocation()` to measure deallocation separately from allocation
	 * (the amounts will both be reported, but the mean of them is the primary result).
	 * @remarks
	 * The benchmark will measure memory allocated in step 2 and freed in step 4.
	 * In a valid use of this function (to collect accurate data) these amounts should be the same.
	 *
	 * This measures the difference in the retained portion of the heap from `beforeAllocation` to `whileAllocated`.
	 * This does not include memory which was used during the operation but released before `whileAllocated` was called.
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
	 *
	 * The details on this are messy implementation details of the JS runtime, and may not be consistent.
	 * In practice, using Node, experiments have found that using async GC causes each GC operation to leak a small amount of memory
	 * (likely due to the async call stack awaiting the GC).
	 * If the same amount is leaked from from each measurement, then the results will be biases as follows:
	 * 1. The before amount by `delta * 1`.
	 * 2. The during amount by `delta * 2`.
	 * 3. The after freeing amount by `delta * 3`.
	 * When using `afterDeallocation`, we compute the values as
	 * 1. `allocated = during - before`
	 * 2. `freed = during - after`
	 * 3. `mean = (allocated + freed) / 2`
	 * This means that the bias is:
	 * 1. `allocated bias = delta * 2 - delta * 1` which is `delta * 1`
	 * 2. `freed bias = delta * 2 - delta * 3` which is `delta * -1`
	 * 3. `mean bias = (allocated bias + freed bias) / 2` which is `0`
	 *
	 * In practice, these deltas seem to be 96 bytes and show up as follows in benchmark results:
	 * ```
	 * memory use
	 * status  name                    Test Duration  Mean Usage  Samples  Margin of Error  Relative Margin of Error  Standard Deviation  Leak per Iteration  Growth per Iteration  Max GCs  Mean GCs  Max Last GC Delta  Mean Allocated  Mean Freed
	 * ------  ----------------------  -------------  ----------  -------  ---------------  ------------------------  ------------------  ------------------  --------------------  -------  --------  -----------------  --------------  ----------
	 *     ✔   empty async GC          0.685 seconds      0.00 B       10           0.00 B                      NaN%              0.00 B            288.00 B                0.00 B        2     2.000            48.00 B         96.00 B    -96.00 B
	 * ```
	 * Note the `Mean Allocated` value of `96.00 B` (`delta * 1`), `Mean Freed` value of `-96.00 B` (`delta * -1`), and `Mean Usage` value of `0.00 B` which shows that the bias is successfully canceled out for the primary reported value.
	 * Additionally note `Leak per Iteration` value of `288.00 B` (`delta * 3`) which aligns with the expectations of each measurement leading one delta, and thus the tree per iteration leaking `3 delta`.
	 * Also note the `Max Last GC Delta`: this is showing that even after the two async GCs, the memory was not stable, and instead increased 48 bytes.
	 * Since `Mean GCs` is 2, this implies that awaiting each async GC pass allocated 48 bytes, and the two together leak the full delta of 96.
	 * This explains every non-zero byte value in the results.
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
