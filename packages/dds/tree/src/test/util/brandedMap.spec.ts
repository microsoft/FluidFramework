/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	brandedSlot,
	getOrCreateSlotContent,
	type BrandedKey,
	type BrandedMapSubset,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../util/brandedMap.js";
import type { Brand, Opaque } from "../../util/index.js";

// These tests currently just cover the type checking.

describe("BrandedMap", () => {
	it("basic use", () => {
		//  See note on BrandedKey.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		type Key = BrandedKey<number, any>;
		const m: BrandedMapSubset<Key> = new Map();
		const keyA: BrandedKey<number, "A"> = brandedSlot();
		// @ts-expect-error Wrong value type
		m.set(keyA, "B");
		m.set(keyA, "A");

		// @ts-expect-error Wrong value type
		const outBad = getOrCreateSlotContent(m, keyA, () => "B");
		const out = getOrCreateSlotContent(m, keyA, () => "A");

		const x: "A" | undefined = m.get(keyA);

		// Generic access with `any` typed key is unsafe, but can't be prevented while being compatible with map.
		m.set(keyA as Key, "B");
		const x2: "B" | undefined = m.get<Key>(keyA);
	});

	// Example from BrandedMapSubset docs.
	it("example", () => {
		type FooSlot<TContent> = BrandedKey<Opaque<Brand<number, "FooSlot">>, TContent>;
		const counterSlot = brandedSlot<FooSlot<number>>();
		// See note on BrandedKey
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const slots: BrandedMapSubset<FooSlot<any>> = new Map();
		slots.set(counterSlot, slots.get(counterSlot) ?? 0 + 1);
	});
});
