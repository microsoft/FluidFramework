/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { call, type Operation, spawn, type Task } from "effection";

/**
 * Callbacks for tracking progress of concurrent processing.
 */
export interface ConcurrencyCallbacks<T> {
	onStart?: (item: T) => void;
	onSuccess?: (item: T) => void;
	onError?: (item: T, error: unknown) => void;
	onFinish?: (item: T) => void;
}

/**
 * Processes items concurrently with a maximum concurrency limit.
 *
 * Unlike effection's `all()`, this accumulates errors rather than failing fast — all items are
 * processed even if some fail. This matches the behavior of the previous `async.mapLimit` usage.
 *
 * @param items - The items to process.
 * @param concurrency - Maximum number of concurrent workers.
 * @param processOne - Async function to process each item.
 * @param callbacks - Optional lifecycle callbacks for progress tracking.
 */
export function* processWithConcurrency<T>(
	items: T[],
	concurrency: number,
	processOne: (item: T) => Promise<void>,
	callbacks?: ConcurrencyCallbacks<T>,
): Operation<void> {
	const queue = [...items];
	const actualConcurrency = Math.min(concurrency, items.length);

	const workers: Task<void>[] = [];
	for (let i = 0; i < actualConcurrency; i++) {
		const worker: Task<void> = yield* spawn(function* () {
			while (queue.length > 0) {
				// Safe: JS is single-threaded; shift() between yield points cannot race.
				const item = queue.shift()!;
				callbacks?.onStart?.(item);
				try {
					yield* call(() => processOne(item));
					callbacks?.onSuccess?.(item);
				} catch (error: unknown) {
					callbacks?.onError?.(item, error);
				} finally {
					callbacks?.onFinish?.(item);
				}
			}
		});
		workers.push(worker);
	}

	for (const worker of workers) {
		yield* worker;
	}
}
