/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Callbacks passed to the `benchmarkFn` of a {@link MemoryUseBenchmark}.
 * @public
 * @sealed
 */
export interface MemoryUseCallbacks {
	/**
	 * Collects a baseline "before" heap snapshot.
	 * Must be called once per iteration before allocating.
	 */
	beforeAllocation(): Promise<void>;
	/**
	 * Collects an "after allocation" heap snapshot.
	 * Must be called once per iteration after allocating and while still holding references to the allocations.
	 */
	whileAllocated(): Promise<void>;
	/**
	 * Collects an "after deallocation" heap snapshot.
	 * Optional — call after releasing the allocation to measure freed bytes separately.
	 */
	afterDeallocation(): Promise<void>;
	/** Returns `true` if another iteration should be run. The loop must continue until this returns `false`. */
	continue(): boolean;
}

/**
 * An operation that uses memory in a way that can be measured.
 * @remarks
 * Use with {@link benchmarkMemoryUse} to measure the memory usage of the operation.
 * Only supported in Node.js environments with `--expose-gc`.
 * @public
 * @input
 */
export interface MemoryUseBenchmark {
	/**
	 * A function that loops until `state.continue()` returns false, calling the callbacks in order each iteration:
	 * 1. `state.beforeAllocation()`
	 * 2. Allocate the memory to measure.
	 * 3. `state.whileAllocated()`
	 * 4. Deallocate the memory allocated in step 2.
	 * 5. Optionally call `state.afterDeallocation()` to measure freed bytes separately
	 *    (both amounts are reported; their mean is the primary result).
	 * @remarks
	 * Reports the difference in retained heap between `beforeAllocation` and `whileAllocated`.
	 * Memory released before `whileAllocated` is called is not included in the measurement.
	 * @privateRemarks
	 * Other schemes (like allowing leaking memory across iterations) could be added as different measurement API / benchmark types if needed.
	 */
	benchmarkFn(state: MemoryUseCallbacks): Promise<void>;

	/**
	 * When set, async garbage collection will be used.
	 * @remarks
	 * Defaults to false.
	 * Enable this to handle cases where a FinalizationRegistry is used and pending finalizers need to be run.
	 * When enabling this, the `await` will leak a small amount of memory.
	 * Using {@link MemoryUseCallbacks.afterDeallocation} can help mitigate this: the bias it introduces cancels out in the primary reported value.
	 *
	 * The details on this are messy implementation details of the JS runtime, and may not be consistent.
	 * In practice, using Node, experiments have found that using async GC causes each GC operation to leak a small amount of memory
	 * (likely due to the async call stack awaiting the GC).
	 * If the same amount is leaked from each measurement, then the results will be biased as follows:
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
	 * Additionally note `Leak per Iteration` value of `288.00 B` (`delta * 3`) which aligns with the expectation of each measurement adding one delta, and thus three measurements per iteration leaking `3 delta`.
	 * Also note the `Max Last GC Delta`: this is showing that even after the two async GCs, the memory was not stable, and instead increased 48 bytes.
	 * Since `Mean GCs` is 2, this implies that awaiting each async GC pass allocated 48 bytes, and the two together leak the full delta of 96.
	 * This explains every non-zero byte value in the results.
	 */
	enableAsyncGC?: boolean;

	/**
	 * Log the processed (allocated/freed) amounts for each iteration to the console.
	 * @remarks
	 * Defaults to false.
	 * Useful when debugging memory tests to see whether specific iterations are causing noise
	 * or to confirm that a specific amount is being leaked.
	 */
	logProcessedData?: boolean;

	/**
	 * Log the raw heap snapshot values for each iteration to the console.
	 * @remarks
	 * Defaults to false.
	 * Useful when debugging memory tests to see whether specific iterations are causing noise
	 * or to confirm that a specific amount is being leaked.
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
