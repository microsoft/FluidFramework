/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent, ITelemetryProperties } from '@fluidframework/common-definitions';

const defaultFailMessage = 'Assertion failed';

/**
 * Assertion failures in SharedTree will throw an exception containing this value as an `errorType`. The Fluid runtime propagates this field
 * in its handlings of errors thrown by containers. See
 * https://github.com/microsoft/FluidFramework/blob/main/packages/loader/container-utils/src/error.ts
 *
 * Exporting this enables users to safely filter telemetry handling of errors based on their type.
 *
 * @public
 */
export const sharedTreeAssertionErrorType = 'SharedTreeAssertion';

/**
 * Telemetry properties decorated on all SharedTree events.
 */
export interface SharedTreeTelemetryProperties extends ITelemetryProperties {
	isSharedTreeEvent: true;
}

/**
 * Returns if the supplied event is a SharedTree telemetry event.
 */
export function isSharedTreeEvent(event: ITelemetryBaseEvent): boolean {
	return ((event as unknown) as SharedTreeTelemetryProperties).isSharedTreeEvent === true;
}

/**
 * Error object thrown by assertion failures in `SharedTree`.
 */
class SharedTreeAssertionError extends Error {
	public readonly errorType = sharedTreeAssertionErrorType;

	public constructor(message: string) {
		super(message);
		this.name = 'Assertion error';
		Error.captureStackTrace?.(this);
	}
}

/**
 * Asserts against a boolean condition. Throws an Error if the assertion failed. Will run and throw in release builds.
 * Use when violations are logic errors in the program.
 * @param condition - A condition to assert is truthy
 * @param message - Message to be printed if assertion fails. Will print "Assertion failed" by default
 * @param containsPII - boolean flag for whether the message passed in contains personally identifying information (PII).
 */
export function assert(condition: unknown, message?: string, containsPII = false): asserts condition {
	if (!condition) {
		fail(message, containsPII);
	}
}

/**
 * Fails an assertion. Throws an Error that the assertion failed.
 * Use when violations are logic errors in the program.
 * @param message - Message to be printed if assertion fails. Will print "Assertion failed" by default
 * @param containsPII - boolean flag for whether the message passed in contains personally identifying information (PII).
 */
export function fail(message: string = defaultFailMessage, containsPII = false): never {
	if (process.env.NODE_ENV !== 'production') {
		debugger;
		console.error(message);
	}

	throw new SharedTreeAssertionError(containsPII ? 'Assertion failed' : message);
}

/**
 * Asserts a value is not undefined, and returns the value.
 * Use when violations are logic errors in the program.
 * @param value - Value to assert against is non undefined.
 * @param message - Message to be printed if assertion fails.
 */
export function assertNotUndefined<T>(value: T | undefined, message = 'value must not be undefined'): T {
	assert(value !== undefined, message);
	return value;
}

/**
 * Asserts an array contains a single value and returns the value.
 * @param array - array to assert contains a single value.
 * @param message - Message to be printed if assertion fails.
 */
export function assertArrayOfOne<T>(array: readonly T[], message = 'array value must contain exactly one item'): T {
	assert(array.length === 1, message);
	return array[0];
}

/**
 * Redefine a property to have the given value. This is simply a type-safe wrapper around
 * `Object.defineProperty`, but it is useful for caching getters on first read.
 * @example
 * ```
 * // `randomOnce()` will return a random number, but always the same random number.
 * {
 *   get randomOnce(): number {
 *     return memoizeGetter(this, 'randomOnce', random(100))
 *   }
 * }
 * ```
 * @param object - the object containing the property
 * @param propName - the name of the property on the object
 * @param value - the value of the property
 */
export function memoizeGetter<T, K extends keyof T>(object: T, propName: K, value: T[K]): T[K] {
	Object.defineProperty(object, propName, {
		value,
		enumerable: true,
		configurable: true,
	});

	return value;
}

/**
 * Iterate through two iterables and return true if they yield equivalent elements in the same order.
 * @param iterableA - the first iterable to compare
 * @param iterableB - the second iterable to compare
 * @param elementComparator - the function used to check if two `T`s are equivalent.
 * Defaults to `Object.is()` equality (a shallow compare)
 */
export function compareIterables<T>(
	iterableA: Iterable<T>,
	iterableB: Iterable<T>,
	elementComparator: (a: T, b: T) => boolean = Object.is
): boolean {
	return compareIterators<T>(iterableA[Symbol.iterator](), iterableB[Symbol.iterator](), elementComparator);
}

/**
 * Iterate through two iterators and return true if they yield equivalent elements in the same order.
 * @param iteratorA - the first iterator to compare
 * @param iteratorB - the second iterator to compare
 * @param elementComparator - the function used to check if two `T`s are equivalent.
 * Defaults to `Object.is()` equality (a shallow compare)
 */
function compareIterators<T, TReturn extends T = T>(
	iteratorA: Iterator<T, TReturn>,
	iteratorB: Iterator<T, TReturn>,
	elementComparator: (a: T, b: T) => boolean = Object.is
): boolean {
	let a: IteratorResult<T, TReturn>;
	let b: IteratorResult<T, TReturn>;
	for (
		a = iteratorA.next(), b = iteratorB.next(); // Given two iterators...
		!a.done && !b.done; // ...while both have elements remaining...
		a = iteratorA.next(), b = iteratorB.next() // ...take one element at a time from each...
	) {
		// ...and ensure that their elements are equivalent
		if (!elementComparator(a.value, b.value)) {
			return false;
		}
	}

	// If one iterator is done, but not the other, then they are not equivalent
	return a.done === b.done;
}

/**
 * Compare two arrays and return true if their elements are equivalent and in the same order.
 * @param arrayA - the first array to compare
 * @param arrayB - the second array to compare
 * @param elementComparator - the function used to check if two `T`s are equivalent.
 * Defaults to `Object.is()` equality (a shallow compare)
 */
export function compareArrays<T>(
	arrayA: readonly T[],
	arrayB: readonly T[],
	elementComparator: (a: T, b: T) => boolean = Object.is
): boolean {
	if (arrayA.length !== arrayB.length) {
		return false;
	}

	for (let i = 0; i < arrayA.length; i++) {
		if (!elementComparator(arrayA[i], arrayB[i])) {
			return false;
		}
	}

	return true;
}

/**
 * Function which does nothing (no-ops).
 */
export function noop(): void {
	// noop
}
