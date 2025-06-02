/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";

import type { FullyReadonly, ISharedArray } from "../index.js";

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
export function fillEntries(sharedArray: ISharedArray<number>, entries: number[]): void {
	let index = 0;
	for (const entry of entries) {
		sharedArray.insert(index, entry);
		index++;
	}
}

/**
 * Creates a mock handle for the given value.
 */
export const verifyIFluidHandleEntries = (
	actualEntries: FullyReadonly<IFluidHandle[]>,
	expectedEntries: FullyReadonly<IFluidHandle[]>,
	message?: string,
): void => {
	assert.equal(
		actualEntries.length,
		expectedEntries.length,
		"length of array not as expected",
	);
	for (let i = 0; i < actualEntries.length; i = i + 1) {
		const actual = actualEntries[i];
		const expected = expectedEntries[i];
		assert.ok(actual);
		assert.ok(expected);
		assert.ok(actualEntries[i]);
		assert.equal(
			toFluidHandleInternal(actual as IFluidHandle).absolutePath,
			toFluidHandleInternal(expected as IFluidHandle).absolutePath,
			`value not as expected at index ${i.toString()}`,
		);
	}
};
