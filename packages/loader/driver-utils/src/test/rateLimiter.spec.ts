/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { RateLimiter } from "../rateLimiter.js";

describe("Rate Limiter", () => {
	let limiter: RateLimiter;

	beforeEach(() => {
		limiter = new RateLimiter(3);
	});

	it("can run task", async () => {
		let done = false;
		assert(limiter.waitQueueLength === 0);
		await limiter.schedule(async () => {
			assert(limiter.waitQueueLength === 0);
			done = true;
		});
		assert(done);
	});

	it("can run 3 tasks", async () => {
		let done = false;
		await limiter.schedule(async () => {
			await limiter.schedule(async () => {
				await limiter.schedule(async () => {
					assert(limiter.waitQueueLength === 0);
					done = true;
				});
			});
		});
		assert(done);
	});

	it("can run 4 tasks", async () => {
		let done = false;
		let promise: Promise<void> | undefined;
		await limiter.schedule(async () => {
			await limiter.schedule(async () => {
				await limiter.schedule(async () => {
					promise = limiter.schedule(async () => {
						done = true;
					});
					assert(limiter.waitQueueLength === 1);
				});
				assert(limiter.waitQueueLength === 0);
			});
		});
		assert(promise !== undefined);
		await promise;
		assert(done);
		assert(limiter.waitQueueLength === 0);
	});

	it("can run a lot of tasks", async () => {
		let counter = 0;
		const tasks = 100;
		const promises: Promise<void>[] = [];
		for (let i = 0; i < tasks; i++) {
			promises.push(
				limiter.schedule(async () => {
					counter++;
				}),
			);
		}

		// This is implementation detail and may not be true in the future.
		// I.e. RateLimiter may asynchronously pick up first 3 tasks.
		assert(limiter.waitQueueLength === tasks - 3);

		await Promise.all(promises);
		assert(counter === tasks);
		assert(limiter.waitQueueLength === 0);
	});

	it("can run many tasks sequentially", async () => {
		let counter = 0;
		const promises: Promise<void>[] = [];
		for (let i = 0; i < 3; i++) {
			promises.push(
				limiter.schedule(async () => {
					counter++;
				}),
			);
		}
		await Promise.all(promises);
		// Now check that we can schedule another task.
		await limiter.schedule(async () => {
			counter++;
		});
		assert(counter === 4);
		assert(limiter.waitQueueLength === 0);
	});
});
