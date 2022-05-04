/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent, ITelemetryProperties } from '@fluidframework/common-definitions';
import BTree from 'sorted-btree';

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
		// Note: conditional as `captureStackTrace` isn't defined in all browsers (e.g. Safari).
		Error.captureStackTrace?.(this);
	}
}

/**
 * A numeric comparator used for sorting in ascending order.
 *
 * Handles +/-0 like Map: -0 is equal to +0.
 */
export function compareFiniteNumbers<T extends number>(a: T, b: T): number {
	return a - b;
}

/**
 * A numeric comparator used for sorting in descending order.
 *
 * Handles +/-0 like Map: -0 is equal to +0.
 */
export function compareFiniteNumbersReversed<T extends number>(a: T, b: T): number {
	return b - a;
}

/**
 * Compares strings lexically to form a strict partial ordering.
 */
export function compareStrings<T extends string>(a: T, b: T): number {
	return a > b ? 1 : a === b ? 0 : -1;
}

/**
 * Asserts against a boolean condition. Throws an Error if the assertion failed. Will run and throw in release builds.
 * Use when violations are logic errors in the program.
 * @param condition - A condition to assert is truthy
 * @param message - Message to be printed if assertion fails. Will print "Assertion failed" by default
 * @param containsPII - boolean flag for whether the message passed in contains personally identifying information (PII).
 */
export function assert(condition: unknown, message?: string, containsPII = false): asserts condition {
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
 * Map an iterable to another iterable
 */
export function* map<T, R>(sequence: Iterable<T>, mapper: (t: T) => R): Iterable<R> {
	for (const t of sequence) {
		yield mapper(t);
	}
}

/**
 * Filter an iterable into another iterable
 */
export function* filter<T>(sequence: Iterable<T>, filter: (t: T) => boolean): Iterable<T> {
	for (const t of sequence) {
		if (filter(t)) {
			yield t;
		}
	}
}

/**
 * Reduce an iterable into a single value, or undefined if the iterable has too few elements to reduce
 */
export function reduce<T>(
	sequence: Iterable<T>,
	reduce: (previous: T, current: T) => T,
	initialValue?: T
): T | undefined {
	let previous: T | undefined;
	let current: T | undefined;
	for (const t of sequence) {
		current = t;
		if (previous === undefined) {
			if (initialValue !== undefined) {
				current = reduce(initialValue, current);
			}
		} else {
			current = reduce(previous, current);
		}
		previous = current;
	}
	return current;
}

/**
 * Returns the first element of the given sequence that satisfies the given predicate, or undefined if no such element exists
 */
export function find<T>(sequence: Iterable<T>, find: (t: T) => boolean): T | undefined {
	for (const t of sequence) {
		if (find(t)) {
			return t;
		}
	}
	return undefined;
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
 * Retrieve a value from a map with the given key, or create a new entry if the key is not in the map.
 * @param map - the map to query/update
 * @param key - the key to lookup in the map
 * @param defaultValue - a function which returns a default value. This is called and used to set an initial value for the given key in the map if none exists
 * @returns either the existing value for the given key, or the newly-created value (the result of `defaultValue`)
 */
export function getOrCreate<K, V>(map: Map<K, V>, key: K, defaultValue: (key: K) => V): V {
	let value = map.get(key);
	if (value === undefined) {
		value = defaultValue(key);
		map.set(key, value);
	}
	return value;
}

/**
 * Function which does nothing (no-ops).
 */
export function noop(): void {
	// noop
}

/**
 * Function which returns its input
 */
export function identity<T>(t: T): T {
	return t;
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
 * Sets a property in such a way that it is only set on `destination` if the provided value is not undefined.
 * This avoids having explicit undefined values under properties that would cause `Object.hasOwnProperty` to return true.
 */
export function setPropertyIfDefined<TDst, P extends keyof TDst>(
	value: TDst[P] | undefined,
	destination: TDst,
	property: P
): void {
	if (value !== undefined) {
		destination[property] = value;
	}
}

/**
 * function (thing: ObjectWithMaybeFoo) {
 * 	   const x: MyActualType = {
 * 	       bar: 3
 *     };
 * 		x.foo = 3;
 *
 * 	    copyPropertyIfDefined(thing, x, 'foo');
 * }
 * @returns
 */

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

export function backmap<K, V>(forwardmap: Map<V, K>): Map<K, V> {
	return new Map(map(forwardmap, ([key, value]) => [value, key]));
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
		map: (ok: TOkIn) => TOkOut
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
		map: (error: TErrorIn) => TErrorOut
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

/** Type that recursively removes `readonly` from fields. */
export type RecursiveMutable<T> = {
	-readonly [K in keyof T]: RecursiveMutable<T[K]>;
};

/** Type that produces a writeable map from a readonly map. */
export type MutableMap<T extends ReadonlyMap<unknown, unknown>> = T extends ReadonlyMap<infer K, infer V>
	? Map<K, V>
	: never;

/** Type that includes the property K: V on T */
export type With<T, K extends keyof never, V> = T & { [key in K]: V };

/**
 * A readonly `Map` which is known to contain a value for every possible key
 */
export interface ClosedMap<K, V> extends Omit<Map<K, V>, 'delete' | 'clear'> {
	get(key: K): V;
}

/**
 * Change the given property Prop of type T to have a type of TPropNew
 */
export type ChangePropType<T, Prop extends keyof T, TPropNew> = Omit<T, Prop> & { [_ in Prop]: TPropNew };

// eslint-disable-next-line @rushstack/no-new-null
type Primitive = string | number | bigint | boolean | null | symbol | undefined;

/**
 * Recursively replace all properties with type assignable to type TReplace in T with properties of type TWith.
 */
export type ReplaceRecursive<T, TReplace, TWith> = T extends TReplace
	? TWith
	: T extends Primitive
	? T
	: {
			[P in keyof T]: ReplaceRecursive<T[P], TReplace, TWith>;
	  };

/** A union type of the first `N` positive integers */
export type TakeWholeNumbers<N extends number, A extends never[] = []> = N extends A['length']
	? never
	: A['length'] | TakeWholeNumbers<N, [never, ...A]>;
/** Returns a tuple type with exactly `Length` elements of type `T` */
export type ArrayOfLength<T, Length extends number, A extends T[] = []> = Length extends A['length']
	? A
	: ArrayOfLength<T, Length, [T, ...A]>;
/**
 * Fails if `array` does not have exactly `length` elements
 */
export function hasExactlyLength<T, Len extends TakeWholeNumbers<16>>(
	array: readonly T[],
	length: Len
): array is ArrayOfLength<T, Len> {
	return array.length === length;
}
/**
 * Fails if `array` does not have at least `length` elements
 */
export function hasLength<T, Len extends TakeWholeNumbers<16>>(
	array: readonly T[],
	length: Len
): array is [...ArrayOfLength<T, Len>, ...T[]] {
	return array.length >= length;
}
