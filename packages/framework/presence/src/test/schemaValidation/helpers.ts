import assert from "node:assert";

import type { createSpiedValidator } from "../testUtils.js";

/**
 * Test data.
 */
export interface Point3D {
	x: number;
	y: number;
	z: number;
}

/**
 * Test data.
 */
export interface TestData {
	num: number;
}

/**
 * Test data.
 */
export type MapValue = { a: number; b: number } | { c: number; d: number };

interface ValidatorTestParams<T extends object> {
	getRemoteValue: () => T | undefined;
	validatorFunction: ReturnType<typeof createSpiedValidator<T>>;
	expectedCallCount: number;
	expectedValue: T | undefined;
}

/**
 * Runs a test against a validator by getting the value and matching the resulting data and validator call counts
 * against expectations.
 */
export function runValidatorTest<T extends object>(params: ValidatorTestParams<T>): void {
	const initialValue = params.getRemoteValue();
	assert.deepEqual(initialValue, params.expectedValue);
	assert.equal(params.validatorFunction.callCount, params.expectedCallCount);
}

interface MultipleCallsTestParams<T extends object> {
	getRemoteValue: () => T | undefined;
	expectedValue: T | undefined;
	validatorFunction: ReturnType<typeof createSpiedValidator<T>>;
}

/**
 * Runs a test against a validator by getting the value multiple times and verifying that the validator is not called
 * multiple times.
 */
export function runMultipleCallsTest<T extends object>(
	params: MultipleCallsTestParams<T>,
): void {
	// First call should invoke validator
	const firstValue = params.getRemoteValue();
	assert.deepEqual(firstValue, params.expectedValue);
	assert.equal(params.validatorFunction.callCount, 1);

	// Subsequent calls should not invoke validator when data is unchanged
	const secondValue = params.getRemoteValue();
	const thirdValue = params.getRemoteValue();
	assert.deepEqual(secondValue, params.expectedValue);
	assert.deepEqual(thirdValue, params.expectedValue);
	assert.equal(params.validatorFunction.callCount, 1);
}
