/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLoggerPropertyBag } from '@fluidframework/telemetry-utils';
import { ITelemetryBaseEvent } from '@fluidframework/common-definitions';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { Payload } from './generic';

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
export interface SharedTreeTelemetryProperties extends ITelemetryLoggerPropertyBag {
	isSharedTreeEvent: true;
}

/**
 * Returns if the supplied event is a SharedTree telemetry event.
 */
export function isSharedTreeEvent(event: ITelemetryBaseEvent): boolean {
	return (event as unknown as SharedTreeTelemetryProperties).isSharedTreeEvent === true;
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
 * @returns true if two `Payloads` are identical.
 * May return false for equivalent payloads encoded differently.
 *
 * Object field order and object identity are not considered significant, and are ignored by this function.
 * (This is because they may not be preserved through roundtrip).
 *
 * For other information which Fluid would lose on serialization round trip,
 * behavior is unspecified other than this this function is reflective (all payloads are equal to themselves)
 * and commutative (argument order does not matter).
 *
 * This means that any Payload is equal to itself and a deep clone of itself.
 *
 * Payloads might not be equal to a version of themselves that has been serialized then deserialized.
 * If they are serialized then deserialized again, the two deserialized objects will compare equal,
 * however the serialized strings may be unequal (due to field order for objects being unspecified).
 *
 * Fluid will cause lossy operations due to use of JSON.stringify().
 * This includes:
 * - Loss of object identity
 * - Loss of field order (may be ordered arbitrarily)
 * - -0 becomes +0
 * - NaN, Infinity, -Infinity all become null
 * - custom toJSON functions may cause arbitrary behavior
 * - functions become undefined or null
 * - non enumerable properties (including prototype) are lost
 * - more (this is not a complete list)
 *
 * Inputs must not contain cyclic references other than fields set to their immediate parent (for the JavaScript feature detection pattern).
 *
 * IFluidHandle instances (detected via JavaScript feature detection pattern) are only compared by absolutePath.
 *
 * TODO:#54095: Is there a better way to do this comparison?
 * @public
 */
export function comparePayloads(a: Payload, b: Payload): boolean {
	// === is not reflective because of how NaN is handled, so use Object.is instead.
	// This treats -0 and +0 as different.
	// Since -0 is not preserved in serialization round trips,
	// it can be handed in any way that is reflective and commutative, so this is fine.
	if (Object.is(a, b)) {
		return true;
	}

	// Primitives which are equal would have early returned above, so now if the values are not both objects, they are unequal.
	if (typeof a !== 'object' || typeof b !== 'object') {
		return false;
	}

	// null is of type object, and needs to be treated as distinct from the empty object.
	// Handling it early also avoids type errors trying to access its keys.
	// Rationale: 'undefined' payloads are reserved for future use (see 'SetValue' interface).
	// eslint-disable-next-line no-null/no-null
	if (a === null || b === null) {
		return false;
	}

	// Special case IFluidHandles, comparing them only by their absolutePath
	// Detect them using JavaScript feature detection pattern: they have a `IFluidHandle` field that is set to the parent object.
	{
		const aHandle = a as IFluidHandle;
		const bHandle = b as IFluidHandle;
		if (aHandle.IFluidHandle === a) {
			if (bHandle.IFluidHandle !== b) {
				return false;
			}
			return a.absolutePath === b.absolutePath;
		}
	}

	// Fluid Serialization (like Json) only keeps enumerable properties, so we can ignore non-enumerable ones.
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);

	if (aKeys.length !== bKeys.length) {
		return false;
	}

	// make sure objects with numeric keys (or no keys) compare unequal to arrays.
	if (Array.isArray(a) !== Array.isArray(b)) {
		return false;
	}

	// Fluid Serialization (like Json) orders object fields arbitrarily, so reordering fields is not considered considered a change.
	// Therefor the keys arrays must be sorted here.
	if (!Array.isArray(a)) {
		aKeys.sort();
		bKeys.sort();
	}

	// First check keys are equal.
	// This will often early exit, and thus is worth doing as a separate pass than recursive check.
	if (!compareArrays(aKeys, bKeys)) {
		return false;
	}

	for (let i = 0; i < aKeys.length; i++) {
		const aItem: Payload = a[aKeys[i]];
		const bItem: Payload = b[bKeys[i]];

		// The JavaScript feature detection pattern, used for IFluidHandle, uses a field that is set to the parent object.
		// Detect this pattern and special case it to avoid infinite recursion.
		const aSelf = Object.is(aItem, a);
		const bSelf = Object.is(bItem, b);
		if (aSelf !== bSelf) {
			return false;
		}
		if (!aSelf) {
			if (!comparePayloads(aItem, bItem)) {
				return false;
			}
		}
	}

	return true;
}

/**
 * Asserts against a boolean condition. Throws an Error if the assertion failed. Will run and throw in release builds.
 * Use when violations are logic errors in the program.
 * @param condition - A condition to assert is truthy
 * @param message - Message to be printed if assertion fails. Will print "Assertion failed" by default
 * @param containsPII - boolean flag for whether the message passed in contains personally identifying information (PII).
 */
export function assert(condition: unknown, message?: string, containsPII = false): asserts condition {
	// Rationale: Assert condition is permitted to be truthy.
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
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
 * `Object.defineProperty`, but it is useful for caching public getters on first read.
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
		a.done !== true && b.done !== true; // ...while both have elements remaining...
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

/**
 * Copies a property in such a way that it is only set on `destination` if it is present on `source`.
 * This avoids having explicit undefined values under properties that would cause `Object.hasOwnProperty` to return true.
 */
export function copyPropertyIfDefined<TSrc, TDst>(source: TSrc, destination: TDst, property: keyof TSrc): void {
	const value = source[property];
	if (value !== undefined) {
		(destination as any)[property] = value;
	}
}

/**
 * A developer facing (non-localized) error message.
 * TODO: better error system.
 */
export type ErrorString = string;
