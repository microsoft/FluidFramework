/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidIterableIterator } from "./fluidMap.js";

/**
 * Like TypeScript's built-in `ReadonlyArray` type.
 *
 * @privateRemarks
 * This exists so that Fluid has a `ReadonlyArray` type which is unaffected by TypeScript's version and configuration options,
 * and safe to implement without being broken by changes to TypeScript's default ReadonlyArray type.
 * All behavior exposed through this interface should be compatible with the corresponding behavior of built-in ReadonlyArrays,
 * but it may lack some of the newer APIs (such as ES2023+ methods like `at()`, `findLast()`, `toReversed()`, etc.),
 * and might express the type slightly differently from how TypeScript does in its `ReadonlyArray` type.
 *
 * @sealed @beta
 */
export interface FluidReadonlyArray<T> {
	/**
	 * Gets the length of the array.
	 */
	readonly length: number;

	/**
	 * Returns the item located at the specified index.
	 * @param index - The zero-based index of the desired element.
	 */
	readonly [n: number]: T;

	/**
	 * Returns an iterator over the elements in this array.
	 */
	[Symbol.iterator](): FluidIterableIterator<T>;

	/**
	 * Returns a string representation of an array.
	 */
	toString(): string;

	/**
	 * Returns a string representation of an array. The elements are converted to string using their toLocaleString methods.
	 */
	toLocaleString(): string;

	/**
	 * Combines two or more arrays.
	 * This method returns a new array without modifying any existing arrays.
	 * @param items - Additional arrays and/or items to add to the end of the array.
	 */
	concat(...items: ConcatArray<T>[]): T[];

	/**
	 * Combines two or more arrays.
	 * This method returns a new array without modifying any existing arrays.
	 * @param items - Additional arrays and/or items to add to the end of the array.
	 */
	concat(...items: (T | ConcatArray<T>)[]): T[];

	/**
	 * Adds all the elements of an array into a string, separated by the specified separator string.
	 * @param separator - A string used to separate one element of the array from the next in the resulting string.
	 */
	join(separator?: string): string;

	/**
	 * Returns a copy of a section of an array.
	 * @param start - The beginning of the specified portion of the array.
	 * @param end - The end of the specified portion of the array.
	 */
	slice(start?: number, end?: number): T[];

	/**
	 * Returns the index of the first occurrence of a value in an array, or -1 if it is not present.
	 * @param searchElement - The value to locate in the array.
	 * @param fromIndex - The array index at which to begin the search.
	 */
	indexOf(searchElement: T, fromIndex?: number): number;

	/**
	 * Returns the index of the last occurrence of a specified value in an array, or -1 if it is not present.
	 * @param searchElement - The value to locate in the array.
	 * @param fromIndex - The array index at which to begin searching backward.
	 */
	lastIndexOf(searchElement: T, fromIndex?: number): number;

	/**
	 * Returns the item at the specified index, allowing for positive and negative integers.
	 * Negative integers count back from the last item in the array.
	 * @param index - The index of the element to retrieve.
	 */
	at(index: number): T | undefined;

	/**
	 * Returns the value of the last element in the array where predicate is true, and undefined otherwise.
	 * @param predicate - findLast calls predicate once for each element of the array, in descending order, until it finds one where predicate returns true.
	 * @param thisArg - If provided, it will be used as the this value for each invocation of predicate.
	 */
	findLast<S extends T>(
		predicate: (value: T, index: number, obj: FluidReadonlyArray<T>) => value is S,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): S | undefined;

	/**
	 * Returns the value of the last element in the array where predicate is true, and undefined otherwise.
	 * @param predicate - findLast calls predicate once for each element of the array, in descending order, until it finds one where predicate returns true.
	 * @param thisArg - If provided, it will be used as the this value for each invocation of predicate.
	 */
	findLast(
		predicate: (value: T, index: number, obj: FluidReadonlyArray<T>) => unknown,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): T | undefined;

	/**
	 * Returns the index of the last element in the array where predicate is true, and -1 otherwise.
	 * @param predicate - findLastIndex calls predicate once for each element of the array, in descending order, until it finds one where predicate returns true.
	 * @param thisArg - If provided, it will be used as the this value for each invocation of predicate.
	 */
	findLastIndex(
		predicate: (value: T, index: number, obj: FluidReadonlyArray<T>) => unknown,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): number;

	/**
	 * Determines whether all the members of an array satisfy the specified test.
	 * @param predicate - A function that accepts up to three arguments.
	 * @param thisArg - An object to which the this keyword can refer in the predicate function.
	 */
	every<S extends T>(
		predicate: (value: T, index: number, array: FluidReadonlyArray<T>) => value is S,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): this is FluidReadonlyArray<S>;

	/**
	 * Determines whether all the members of an array satisfy the specified test.
	 * @param predicate - A function that accepts up to three arguments.
	 * @param thisArg - An object to which the this keyword can refer in the predicate function.
	 */
	every(
		predicate: (value: T, index: number, array: FluidReadonlyArray<T>) => unknown,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): boolean;

	/**
	 * Determines whether the specified callback function returns true for any element of an array.
	 * @param predicate - A function that accepts up to three arguments.
	 * @param thisArg - An object to which the this keyword can refer in the predicate function.
	 */
	some(
		predicate: (value: T, index: number, array: FluidReadonlyArray<T>) => unknown,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): boolean;

	/**
	 * Performs the specified action for each element in an array.
	 * @param callbackfn - A function that accepts up to three arguments.
	 * @param thisArg - An object to which the this keyword can refer in the callbackfn function.
	 */
	forEach(
		callbackfn: (value: T, index: number, array: FluidReadonlyArray<T>) => void,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): void;

	/**
	 * Calls a defined callback function on each element of an array, and returns an array that contains the results.
	 * @param callbackfn - A function that accepts up to three arguments.
	 * @param thisArg - An object to which the this keyword can refer in the callbackfn function.
	 */
	map<U>(
		callbackfn: (value: T, index: number, array: FluidReadonlyArray<T>) => U,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): U[];

	/**
	 * Returns the elements of an array that meet the condition specified in a callback function.
	 * @param predicate - A function that accepts up to three arguments.
	 * @param thisArg - An object to which the this keyword can refer in the predicate function.
	 */
	filter<S extends T>(
		predicate: (value: T, index: number, array: FluidReadonlyArray<T>) => value is S,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): S[];

	/**
	 * Returns the elements of an array that meet the condition specified in a callback function.
	 * @param predicate - A function that accepts up to three arguments.
	 * @param thisArg - An object to which the this keyword can refer in the predicate function.
	 */
	filter(
		predicate: (value: T, index: number, array: FluidReadonlyArray<T>) => unknown,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): T[];

	/**
	 * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
	 * @param callbackfn - A function that accepts up to four arguments.
	 */
	reduce(
		callbackfn: (
			previousValue: T,
			currentValue: T,
			currentIndex: number,
			array: FluidReadonlyArray<T>,
		) => T,
	): T;

	/**
	 * Calls the specified callback function for all the elements in an array. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
	 * @param callbackfn - A function that accepts up to four arguments.
	 * @param initialValue - Used as the initial value to start the accumulation.
	 */
	reduce<U>(
		callbackfn: (
			previousValue: U,
			currentValue: T,
			currentIndex: number,
			array: FluidReadonlyArray<T>,
		) => U,
		initialValue: U,
	): U;

	/**
	 * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
	 * @param callbackfn - A function that accepts up to four arguments.
	 */
	reduceRight(
		callbackfn: (
			previousValue: T,
			currentValue: T,
			currentIndex: number,
			array: FluidReadonlyArray<T>,
		) => T,
	): T;

	/**
	 * Calls the specified callback function for all the elements in an array, in descending order. The return value of the callback function is the accumulated result, and is provided as an argument in the next call to the callback function.
	 * @param callbackfn - A function that accepts up to four arguments.
	 * @param initialValue - Used as the initial value to start the accumulation.
	 */
	reduceRight<U>(
		callbackfn: (
			previousValue: U,
			currentValue: T,
			currentIndex: number,
			array: FluidReadonlyArray<T>,
		) => U,
		initialValue: U,
	): U;

	/**
	 * Returns the value of the first element in the array where predicate is true, and undefined otherwise.
	 * @param predicate - find calls predicate once for each element of the array, in ascending order, until it finds one where predicate returns true.
	 * @param thisArg - If provided, it will be used as the this value for each invocation of predicate.
	 */
	find<S extends T>(
		predicate: (value: T, index: number, obj: FluidReadonlyArray<T>) => value is S,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): S | undefined;

	/**
	 * Returns the value of the first element in the array where predicate is true, and undefined otherwise.
	 * @param predicate - find calls predicate once for each element of the array, in ascending order, until it finds one where predicate returns true.
	 * @param thisArg - If provided, it will be used as the this value for each invocation of predicate.
	 */
	find(
		predicate: (value: T, index: number, obj: FluidReadonlyArray<T>) => unknown,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): T | undefined;

	/**
	 * Returns the index of the first element in the array where predicate is true, and -1 otherwise.
	 * @param predicate - find calls predicate once for each element of the array, in ascending order, until it finds one where predicate returns true.
	 * @param thisArg - If provided, it will be used as the this value for each invocation of predicate.
	 */
	findIndex(
		predicate: (value: T, index: number, obj: FluidReadonlyArray<T>) => unknown,
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): number;

	/**
	 * Returns an iterable of keys in the array.
	 */
	keys(): FluidIterableIterator<number>;

	/**
	 * Returns an iterable of values in the array.
	 */
	values(): FluidIterableIterator<T>;

	/**
	 * Returns an iterable of key, value pairs for every entry in the array.
	 */
	entries(): FluidIterableIterator<[number, T]>;

	/**
	 * Determines whether an array includes a certain element, returning true or false as appropriate.
	 * @param searchElement - The element to search for.
	 * @param fromIndex - The position in this array at which to begin searching for searchElement.
	 */
	includes(searchElement: T, fromIndex?: number): boolean;

	/**
	 * Calls a defined callback function on each element of an array. Then, flattens the result into a new array.
	 * @param callback - A function that accepts up to three arguments.
	 * @param thisArg - An object to which the this keyword can refer in the callback function.
	 */
	flatMap<U>(
		callback: (value: T, index: number, array: FluidReadonlyArray<T>) => U | readonly U[],
		// Typing inherited from ReadonlyArray.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): U[];

	/**
	 * Returns a new array with all sub-array elements concatenated into it recursively up to the specified depth.
	 * @param depth - The maximum recursion depth. Defaults to 1.
	 */
	flat<A, D extends number = 1>(this: A, depth?: D): FlatArray<A, D>[];

	/**
	 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/unscopables | Symbol.unscopables}
	 */
	readonly [Symbol.unscopables]: {
		[K in keyof FluidReadonlyArray<T>]?: boolean;
	};
}
