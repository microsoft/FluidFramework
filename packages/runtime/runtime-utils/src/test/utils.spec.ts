/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { encodeCompactIdToString } from "../utils.js";

describe("Utils", () => {
	beforeEach(() => {});

	it("encodeCompactIdToString() with strings", () => {
		assert(encodeCompactIdToString("a-b-c") === "a-b-c", "text");
		assert(encodeCompactIdToString("_abcdefghijklmn") === "_abcdefghijklmn", "text");
	});

	it("encodeCompactIdToString() has base of 64 (sort of)", () => {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[abcdefghijklmnopqrstuvwxyz{01234567890";
		for (let i = 0; i < 64; i++) {
			const value = encodeCompactIdToString(i);
			assert(value.length === 1, "length");
			assert(chars[i] === value, "value");
		}

		for (let i = 64; i < 65 * 64 - 1; i++) {
			const value = encodeCompactIdToString(i);
			assert(value.length === 2, "length");
			assert(chars.includes(value[0]), "value");
			assert(chars.includes(value[1]), "value");
		}

		// This is a bit weird, as it does not work as our intuition suggests.
		// That's because in base10 system we do not use "01" form - leading 0 is not used.
		// Here, because we use forms like 01, 001, 011, we can put more numbers into less chars.
		assert(encodeCompactIdToString(64) === "AA", "AA");
		assert(encodeCompactIdToString(64 * 64) === "9A", "9A");
		assert(encodeCompactIdToString(64 * 64 * 64) === "89A", "89A");
		assert(encodeCompactIdToString(64 * 64 * 64 * 64) === "889A", "889A"); // 16M!
		assert(encodeCompactIdToString(64 * 64 * 64 * 64 * 64) === "8889A", "8889A"); // 1G (~10^9)
		assert(encodeCompactIdToString(64 * 64 * 64 * 64 * 64 * 64) === "88889A", "88889A");
	});

	it("encodeCompactIdToString() generates Unique values", () => {
		const result: Set<string> = new Set();
		const len = 10000;
		for (let i = 0; i < len; i++) {
			const value = encodeCompactIdToString(i);
			result.add(value);

			// Strong rules:
			assert(!value.includes("/"), "no slashses");
			assert(value.length > 0, "length");

			// Soft rules: these rules can be broken, but they are great to have for efficiency
			// as such IDs are encoded as JSON, and some symbols require escaping
			assert(!value.includes('"'), "no quotes");
			assert(!value.includes("\\"), "no backslashes");
		}
		assert(result.size === len, "collision detected!");
	});

	it("encodeCompactIdToString() with prefix", () => {
		const result: Set<string> = new Set();
		const len = 1000;
		for (let i = 0; i < len; i++) {
			const value = encodeCompactIdToString(i, "_");
			result.add(value);

			assert(!value.includes("/"), "no slashses");
			assert(value.startsWith("_"), "prefix");
			assert(value.length > 1, "length");
		}
		assert(result.size === len, "collision detected!");
	});
});
