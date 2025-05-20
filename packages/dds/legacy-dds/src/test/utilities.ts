/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SharedArray } from "../index.js";

/**
 * Verifies that two arrays contain the same entries.
 */
export function verifyEntries<T>(actual: readonly T[], expected: T[], msg?: string): void {
	assert.equal(actual.length, expected.length, `Length mismatch. ${msg ?? ""}`);
	for (let i = 0; i < expected.length; i++) {
		assert.deepEqual(actual[i], expected[i], `Mismatch at index ${i}. ${msg ?? ""}`);
	}
}

/**
 * Verifies that the actual boolean results match the expected ones, used for event validation.
 */
export function verifyEventsEmitted(
	actual: boolean[],
	expected: boolean[],
	eventNames: readonly string[],
): void {
	assert.equal(actual.length, expected.length, "Event array lengths don't match.");
	for (let i = 0; i < actual.length; i++) {
		assert.equal(
			actual[i],
			expected[i],
			`Event "${eventNames[i]}" expected=${expected[i]}, actual=${actual[i]}`,
		);
	}
}

/**
 * Returns a random integer between min (inclusive) and max (exclusive).
 */
export function getRandomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min))) + Math.ceil(min);
}

/**
 * Inserts all elements of `entries` into the `SharedArray`.
 */
export function fillEntries(sharedArray: SharedArray<number>, entries: number[]): void {
	let index = 0;
	for (const entry of entries) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
		sharedArray.insert(index, entry);
		index++;
	}
}
