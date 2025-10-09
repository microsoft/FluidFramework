/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ThrottlingError } from "@fluidframework/server-services-core";
import { strict as assert } from "assert";
import { TestThrottler } from "../testThrottler";

describe("Test for Test Utils", () => {
	describe("TestThrottler", () => {
		it("throttles when incremented past limit", () => {
			const limit = 10;
			const throttler = new TestThrottler(limit);
			const id = "id";

			for (let i = 0; i < limit; i++) {
				assert.doesNotThrow(() => throttler.incrementCount(id, 1));
			}
			assert.throws(() => throttler.incrementCount(id, 1), ThrottlingError);
		});

		it("un-throttles when decremented below limit", () => {
			const limit = 10;
			const throttler = new TestThrottler(limit);
			const id = "id";

			for (let i = 0; i < limit; i++) {
				assert.doesNotThrow(() => throttler.incrementCount(id, 1)); // i + 1
			}
			assert.throws(() => throttler.incrementCount(id, 1), ThrottlingError); // limit + 1
			assert.throws(() => throttler.incrementCount(id, 1), ThrottlingError); // limit + 1
			assert.throws(() => throttler.incrementCount(id, 1), ThrottlingError); // limit + 1

			throttler.decrementCount(id, 1); // limit
			throttler.decrementCount(id, 1); // limit - 1
			assert.doesNotThrow(() => throttler.incrementCount(id, 1)); // limit
		});
	});
});
