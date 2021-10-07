/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent, ITelemetryProperties } from '@fluidframework/common-definitions';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import BTree from 'sorted-btree';
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
export interface SharedTreeTelemetryProperties extends ITelemetryProperties {
	readonly isSharedTreeEvent: true;
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
 * For other information which fluid would lose on serialization round trip,
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
	if (a instanceof Array !== b instanceof Array) {
		return false;
	}

	// Fluid Serialization (like Json) orders object fields arbitrarily, so reordering fields is not considered considered a change.
	// Therefor the keys arrays must be sorted here.
	if (!(a instanceof Array)) {
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
 *
 * When practical, prefer the pattern `x ?? fail('message')` over `assertNotUndefined(x, 'message')`.
 * Using `?? fail` allows for message formatting without incurring the cost of formatting the message in the non failing case
 * (ex:
 * ```
 * x ?? fail(`x should exist for ${y}`)
 * ```
 * ). Additionally the `?? fail` avoids an extra call/stack frame in the non failing case.
 *
 * Another pattern to prefer over `assertNotUndefined(x, 'message')` is `assert(x !== undefined)`.
 * This pattern is preferred because it is more general (same approach works with typeof, instance of, comparison to other values etc.).
 *
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
 * Assign a property and value to a given object.
 * @param object - the object to add the property to
 * @param property - the property key
 * @param value - the value of the property
 * @returns `object` after assigning `value` to the property `property`.
 */
export function assign<T, K extends keyof never, V>(object: T, property: K, value: V): With<T, K, V> {
	return Object.assign(object, { [property]: value }) as With<T, K, V>;
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
 * Compare two maps and return true if their contents are equivalent.
 * @param mapA - the first array to compare
 * @param mapB - the second array to compare
 * @param elementComparator - the function used to check if two `T`s are equivalent.
 * Defaults to `Object.is()` equality (a shallow compare)
 */
export function compareMaps<K, V>(
	mapA: ReadonlyMap<K, V>,
	mapB: ReadonlyMap<K, V>,
	elementComparator: (a: V, b: V) => boolean = Object.is
): boolean {
	if (mapA.size !== mapB.size) {
		return false;
	}

	for (const [keyA, valueA] of mapA) {
		const valueB = mapB.get(keyA);
		if (valueB === undefined || !elementComparator(valueA, valueB)) {
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

function breakOnDifference(): { break: boolean } {
	return { break: true };
}

/**
 * Helper that returns whether two b-trees are equal.
 * Accelerated when large portions of the tree are shared between the two.
 */
export function compareBtrees<K, V>(treeA: BTree<K, V>, treeB: BTree<K, V>, compare: (valA: V, valB: V) => boolean) {
	const diff = treeA.diffAgainst(treeB, breakOnDifference, breakOnDifference, (_, valA, valB) => {
		if (!compare(valA, valB)) {
			return { break: true };
		}
		return undefined;
	});

	return diff === undefined;
}

/**
 * A developer facing (non-localized) error message.
 * TODO: better error system.
 */
export type ErrorString = string;

/**
 * Discriminated union instance that wraps either a result of type `TOk` or an error of type `TError`.
 */
export type Result<TOk, TError> = Result.Ok<TOk> | Result.Error<TError>;

export namespace Result {
	/**
	 * Factory function for making a successful Result.
	 * @param result - The result to wrap in the Result.
	 */
	export function ok<TOk>(result: TOk): Ok<TOk> {
		return { type: ResultType.Ok, result };
	}
	/**
	 * Factory function for making a unsuccessful Result.
	 * @param error - The error to wrap in the Result.
	 */
	export function error<TError>(error: TError): Error<TError> {
		return { type: ResultType.Error, error };
	}
	/**
	 * Type guard for successful Result.
	 * @returns True if `result` is successful.
	 */
	export function isOk<TOk, TError>(result: Result<TOk, TError>): result is Ok<TOk> {
		return result.type === ResultType.Ok;
	}
	/**
	 * Type guard for unsuccessful Result.
	 * @returns True if `result` is unsuccessful.
	 */
	export function isError<TOk, TError>(result: Result<TOk, TError>): result is Error<TError> {
		return result.type === ResultType.Error;
	}
	/**
	 * Maps the given result with the given function when the result is ok.
	 * @param result - The result to map.
	 * @param map - The function to apply to derive the new result.
	 * @returns The given result if it is not ok, the mapped result otherwise.
	 */
	export function mapOk<TOkIn, TOkOut, TError>(
		result: Result<TOkIn, TError>,
		map: (TOkIn) => TOkOut
	): Result<TOkOut, TError> {
		return isOk(result) ? ok(map(result.result)) : result;
	}
	/**
	 * Maps the given result with the given function when the result is an error.
	 * @param result - The result to map.
	 * @param map - The function to apply to derive the new error.
	 * @returns The given result if it is ok, the mapped result otherwise.
	 */
	export function mapError<TOk, TErrorIn, TErrorOut>(
		result: Result<TOk, TErrorIn>,
		map: (TErrorIn) => TErrorOut
	): Result<TOk, TErrorOut> {
		return isError(result) ? error(map(result.error)) : result;
	}
	/**
	 * Tag value use to differentiate the members of the `Result` discriminated union.
	 */
	export enum ResultType {
		/** Signals a successful result. */
		Ok,
		/** Signals an unsuccessful result. */
		Error,
	}
	/**
	 * Wraps a result of type `TOk`.
	 */
	export interface Ok<TOk> {
		readonly type: ResultType.Ok;
		readonly result: TOk;
	}
	/**
	 * Wraps an error of type `TError`.
	 */
	export interface Error<TError> {
		readonly type: ResultType.Error;
		readonly error: TError;
	}
}

/** Type that removes `readonly` from fields. */
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/** Type that includes the property K: V on T */
export type With<T, K extends keyof never, V> = T & { [key in K]: V };
