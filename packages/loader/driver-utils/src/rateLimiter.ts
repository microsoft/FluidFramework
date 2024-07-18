/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

/**
 * @legacy
 * @alpha
 */
export class RateLimiter {
	private readonly tasks: (() => void)[] = [];
	constructor(private maxRequests: number) {
		assert(maxRequests > 0, 0x0ae /* "Tried to create rate limiter with 0 max requests!" */);
	}

	public get waitQueueLength(): number {
		return this.tasks.length;
	}

	// Run when one of the tasks finished running.
	// Release next task if we have one, or allow more tasks to run in future.
	protected readonly release = () => {
		const task = this.tasks.shift();
		if (task !== undefined) {
			return task();
		}
		this.maxRequests++;
	};

	protected async acquire() {
		if (this.maxRequests > 0) {
			this.maxRequests--;
			return;
		}

		return new Promise<void>((resolve) => {
			this.tasks.push(resolve);
		});
	}

	public async schedule<T>(work: () => Promise<T>) {
		await this.acquire();
		return work().finally(this.release);
	}
}
