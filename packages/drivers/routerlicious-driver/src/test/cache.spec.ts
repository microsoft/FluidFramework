/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { ICache, InMemoryCache } from "../cache";

describe("InMemoryCache", () => {
	let clock: SinonFakeTimers;
	let cache: ICache<number>;

	before(() => {
		clock = useFakeTimers();
	});

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});

	it("No expiry", async () => {
		cache = new InMemoryCache();
		await cache.put("one", 1);

		clock.tick(Number.MAX_SAFE_INTEGER);

		assert.equal(await cache.get("one"), 1, "Entry shouldn't expire");
	});

	it("With expiry", async () => {
		const expiryMs = 10;
		cache = new InMemoryCache<number>(expiryMs);

		await cache.put("one", 1);
		await cache.put("two", 2);

		clock.tick(5);
		assert.equal(await cache.get("one"), 1, "'one' shouldn't be expired after 5ms");
		assert.equal(await cache.get("two"), 2, "'two' shouldn't be expired after 5ms");

		assert.equal(await cache.get("one"), 1); // Should NOT reset the expiry, only put does
		await cache.put("two", 2.1);
		await cache.put("three", 3);

		clock.tick(5);
		assert.equal(await cache.get("one"), undefined, "'one' should be expired after 10ms");
		assert.equal(await cache.get("two"), 2.1, "'two' shouldn't be expired after 5ms");
		assert.equal(await cache.get("three"), 3, "'three' shouldn't be expired after 5ms");
	});
});
