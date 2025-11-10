/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IThrottlerResponse } from "@fluidframework/server-services-core";
import { strict as assert } from "assert";
import Sinon from "sinon";
import { TestThrottlerHelper } from "../testThrottlerHelper";

describe("Test for Test Utils", () => {
	beforeEach(() => {
		// use fake timers to have full control over the passage of time
		Sinon.useFakeTimers();
	});

	afterEach(() => {
		Sinon.restore();
	});

	describe("ThrottlerHelper", () => {
		it("throttles on too many operations", async () => {
			const rate = 10;
			const throttlerHelper = new TestThrottlerHelper(rate);

			const id = "test-id";

			let response: IThrottlerResponse;
			for (let i = 0; i < rate; i++) {
				response = await throttlerHelper.updateCount(id, 1);
				assert.strictEqual(response.throttleStatus, false);
			}
			response = await throttlerHelper.updateCount(id, 1);
			assert.strictEqual(response.throttleStatus, true);
		});

		it("throttles on too large operation", async () => {
			const rate = 1;
			const throttlerHelper = new TestThrottlerHelper(rate);

			const id = "test-id";

			const response = await throttlerHelper.updateCount(id, rate + 1);
			assert.strictEqual(response.throttleStatus, true);
		});

		it("un-throttles after sufficient cooldown time", async () => {
			const rate = 1;
			const throttlerHelper = new TestThrottlerHelper(rate);

			const id = "test-id";

			let response = await throttlerHelper.updateCount(id, rate + 1);
			assert.strictEqual(response.throttleStatus, true);

			Sinon.clock.tick(response.retryAfterInMs);
			response = await throttlerHelper.updateCount(id, 0);
			assert.strictEqual(response.throttleStatus, false);

			// for longer
			response = await throttlerHelper.updateCount(id, rate + 10);
			assert.strictEqual(response.throttleStatus, true);

			Sinon.clock.tick(response.retryAfterInMs);
			response = await throttlerHelper.updateCount(id, 0);
			assert.strictEqual(response.throttleStatus, false);
		});

		it("does not throttle sufficiently metered out operations", async () => {
			const rate = 10;
			const throttlerHelper = new TestThrottlerHelper(rate);

			const id = "test-id";

			let response: IThrottlerResponse;
			for (let i = 0; i < rate; i++) {
				response = await throttlerHelper.updateCount(id, 1);
				assert.strictEqual(response.throttleStatus, false);
				Sinon.clock.tick(1);
			}
			response = await throttlerHelper.updateCount(id, 1);
			assert.strictEqual(response.throttleStatus, false);
		});

		it("stores most recently calculated throttle status in cache", async () => {
			const rate = 1;
			const throttlerHelper = new TestThrottlerHelper(rate);

			const id = "test-id";

			let response: IThrottlerResponse;
			let cachedResponse: IThrottlerResponse;

			response = await throttlerHelper.updateCount(id, 1);
			assert.strictEqual(response.throttleStatus, false);
			cachedResponse = await throttlerHelper.getThrottleStatus(id);
			assert.deepStrictEqual(cachedResponse, response);

			response = await throttlerHelper.updateCount(id, 1);
			assert.strictEqual(response.throttleStatus, true);
			cachedResponse = await throttlerHelper.getThrottleStatus(id);
			assert.deepStrictEqual(cachedResponse, response);
		});

		it("returns undefined when trying to retrieve unknown throttleStatus", async () => {
			const rate = 1;
			const throttlerHelper = new TestThrottlerHelper(rate);

			const id = "test-id";

			await assert.doesNotReject(throttlerHelper.getThrottleStatus(id));
		});
	});
});
