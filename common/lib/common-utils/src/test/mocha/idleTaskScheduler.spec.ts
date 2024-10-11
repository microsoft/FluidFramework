/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { SinonFakeTimers, useFakeTimers, fake, match } from "sinon";

import * as idleTask from "../../idleTaskScheduler";

describe("Idle task scheduler", () => {
	let clock: SinonFakeTimers;

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach("setClock", () => {
		(globalThis as any).requestIdleCallback = undefined;
	});

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});

	function someTask(x: number): boolean {
		return x > 3 ? true : false;
	}

	it("Should schedule and run a synchronous task during idle time", async () => {
		const requestIdleCallbackMock = fake((callback, timeout) => {
			callback(timeout);
		});
		(globalThis as any).requestIdleCallback = requestIdleCallbackMock;

		await idleTask.scheduleIdleTask(() => {
			someTask(5);
		}, 1000);

		assert(requestIdleCallbackMock.calledOnce);
		assert(requestIdleCallbackMock.calledWith(match.func, { timeout: 1000 }));
	});

	it("Should fall back to setTimeout when idle Task API is not available", async () => {
		let success = false;
		assert((globalThis as any).requestIdleCallback === undefined);
		await new Promise((resolve, reject) => {
			try {
				resolve(async () => {
					await idleTask.scheduleIdleTask(() => {
						someTask(5);
					}, 1000);
				});
			} catch (error) {
				reject(error);
			}
		}).then(() => {
			success = true;
		});
		clock.tick(1100);
		assert(success);
	});
});
