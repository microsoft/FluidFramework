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
 * Use with {@link benchmarkMemory} to measure the memory usage of the operation.
 * @public
 */
export interface MemoryUseBenchmark {
	/**
	 * A function that should loop until `callbacks.continue()` returns false, and in each loop call the callbacks in order:
	 * 1. `callbacks.beforeAllocation()`
	 * 2. Allocate memory in some way.
	 * 3. `callbacks.whileAllocated()`
	 * 4. Deallocate the memory allocated in step 2.
	 * 5. `callbacks.afterDeallocation()`
	 * @remarks
	 * The benchmark will measure memory use inn step 2 and freed in step 4.
	 * A valid use of this function (to avoid errors anc collect accurate data) these amounts should be the same
	 * (memory should not accumulate across iterations).
	 * @privateRemarks
	 * Other schemes (like allowing leaking memory across iterations) could be added as different measurement API / benchmark types if needed.
	 */
	benchmarkFn(state: MemoryUseCallbacks): Promise<void>;
}
