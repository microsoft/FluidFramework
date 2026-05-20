/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assertProperUse } from "../assert.js";
import { type MemoryUseBenchmark } from "./configuration.js";

/**
 * Options for {@link memoryAddedBy}.
 * @public
 * @input
 */
export interface MemoryUseModifier<TIn> {
	/**
	 * Create a value to modify.
	 */
	setup(): TIn | Promise<TIn>;

	/**
	 * Modifies the value from setup.
	 * @remarks
	 * Typically this does some operation which causes `input` to retain additional memory, like inserting or adding something to it.
	 * The additional memory retained by `input` after this operation will be measured.
	 */
	modify(input: TIn): void | Promise<void>;

	/**
	 * Optional callback to run after the value has been modified and after the
	 * `whileAllocated` measurement snapshot has been taken.
	 * @remarks
	 * Any allocations or mutations performed here are not reflected in the measured "while allocated" memory usage.
	 * This hook is intended for cleanup or resetting state between benchmark iterations.
	 * @param input - The value that was created by `setup` and modified by `modify`.
	 */
	after?(input: TIn): void | Promise<void>;
}

/**
 * A simple container for a value that can be empty or full.
 * @remarks
 * Useful for use in memory tests.
 * Often stack variables get longer lifetime than expected, and are hard to clear.
 * This utility can wrap the stack variable and give explicit control of its lifetime.
 *
 * `undefined` is used internally to represent the empty state, so `T` must not include `undefined`.
 * @public
 */
export class Box<T extends NonNullable<unknown>> {
	private inner?: T;
	private constructor() {}

	/**
	 * Creates a box that holds the provided item.
	 */
	public static full<T extends NonNullable<unknown>>(item: T): Box<T> {
		const box = new Box<T>();
		box.value = item;
		return box;
	}

	/**
	 * Creates an empty box.
	 */
	public static empty<T extends NonNullable<unknown>>(): Box<T> {
		return new Box<T>();
	}

	/**
	 * The value contained in the box.
	 * @throws if the value is undefined.
	 */
	public get value(): T {
		assertProperUse(this.inner !== undefined, "Box is empty");
		return this.inner;
	}

	public set value(v: T) {
		assertProperUse(v !== undefined, "Box cannot be set to undefined");
		this.inner = v;
	}

	/**
	 * Clear the box, removing its contained value.
	 */
	public clear(): void {
		this.inner = undefined;
	}
}

/**
 * Measures the memory usage added by applying the provided modifier.
 *
 * @returns A MemoryUseBenchmark object for the provided function.
 * Use with {@link benchmarkMemoryUse}.
 *
 * @remarks
 * This measures the increased memory use by applying {@link MemoryUseModifier.modify} to the output of {@link MemoryUseModifier.setup}.
 * The function will be run multiple times as part of getting an accurate measurement,
 * each one creating a new instance using {@link MemoryUseModifier.setup}.
 *
 * This opts out of {@link MemoryUseBenchmark.enableAsyncGC} as it should not be required.
 * If it is desired, you can override that when invoking {@link benchmarkMemoryUse}.
 *
 * @privateRemarks
 * We could have run multiple allocations per measurement similar to how duration benchmarks are run.
 * That should not be needed, as we shouldn't have bias from measurement overhead or other sources of inaccuracy,
 * but such a pattern might end up being useful for some cases in the future.
 * @public
 */
export function memoryAddedBy<TIn extends NonNullable<unknown>>(
	options: MemoryUseModifier<TIn>,
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

/**
 * Measures the memory usage of the value returned by the provided function (after awaiting it).
 * The function is called for each iteration of the benchmark.
 *
 * @param factory - A function that returns the value to measure memory usage for.
 * @returns A MemoryUseBenchmark object for the provided function.
 * Use with {@link benchmarkMemoryUse}.
 *
 * @remarks
 * This measures the memory uniquely retained by the object produced by the factory function.
 * The function will be run multiple times as part of getting an accurate measurement.
 *
 * This opts out of {@link MemoryUseBenchmark.enableAsyncGC} as it should not be required.
 * If it is desired, you can override that when invoking {@link benchmarkMemoryUse}.
 *
 * @privateRemarks
 * We could have run multiple allocations per measurement similar to how duration benchmarks are run.
 * That should not be needed, as we shouldn't have bias from measurement overhead or other sources of inaccuracy,
 * but such a pattern might end up being useful for some cases in the future.
 * @public
 */
export function memoryUseOfValue<TOut extends NonNullable<unknown>>(
	factory: () => TOut | Promise<TOut>,
): MemoryUseBenchmark {
	return {
		enableAsyncGC: false,
		benchmarkFn: async (state) => {
			const box = Box.empty<Awaited<TOut>>();
			while (state.continue()) {
				await state.beforeAllocation();
				// allocation window: hold the value until whileAllocated, then release
				box.value = await factory();
				await state.whileAllocated();
				box.clear();
				await state.afterDeallocation();
			}
		},
	};
}
