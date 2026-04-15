/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Box, type MemoryUseBenchmark, type MemoryUseModifier } from "@fluid-tools/benchmark";

/**
 * These tests are quite slow, so force a lower iteration count.
 * If we need better data at some point, we can look into raising it.
 */
export const iterationSettings = { keepIterations: 4, warmUpIterations: 2 };

/**
 * `memoryAddedBy` from benchmark tool extended with an optional `after` callback.
 *
 * TODO: remove this after benchamrk tool is updated to support the `after` callback.
 */
export function memoryAddedBy<TIn extends NonNullable<unknown>>(
	options: MemoryUseModifier<TIn> & { after?: (input: TIn) => void | Promise<void> },
): MemoryUseBenchmark {
	return {
		enableAsyncGC: false,
		benchmarkFn: async (state) => {
			// Allocate box outside of measurement window.
			const box = Box.empty<TIn>();
			while (state.continue()) {
				box.value = await options.setup();
				await state.beforeAllocation();
				await options.modify(box.value);
				await state.whileAllocated();
				await options.after?.(box.value);
				box.clear();
				// afterDeallocation must not be called here:
				// box.clear() frees the whole object not just what was added by the modifications,
				// so the freed measurement would not match the allocation, and would thus provide incorrect data.
			}
		},
	};
}
