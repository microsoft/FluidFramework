/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidIterableIterator, FluidReadonlyArray } from "../../index.js";
import type { isAssignableTo, requireFalse, requireTrue } from "./typeTestUtils.js";

// Under this repo's ES2020 lib, native ReadonlyArray lacks at()/findLast()/findLastIndex()
// that FluidReadonlyArray requires, so it is NOT assignable to FluidReadonlyArray.
// (Under ES2023+ libs, this would be true instead.)
declare type _readonlyArray_to_fluidReadonlyArray = requireFalse<
	isAssignableTo<readonly string[], FluidReadonlyArray<string>>
>;

// FluidReadonlyArray is NOT assignable to ReadonlyArray due to minor structural differences
// in Symbol.unscopables typing. This is acceptable — the important direction is that
// native arrays (which ARE ReadonlyArray) remain assignable to FluidReadonlyArray under ES2023+.
declare type _fluidReadonlyArray_to_readonlyArray = requireFalse<
	isAssignableTo<FluidReadonlyArray<string>, readonly string[]>
>;

// Native mutable Array is NOT assignable to FluidReadonlyArray under ES2020
// (missing at/findLast/findLastIndex).
declare type _array_to_fluidReadonlyArray = requireFalse<
	isAssignableTo<string[], FluidReadonlyArray<string>>
>;

// FluidReadonlyArray iteration methods return FluidIterableIterator
declare type _keys_returns_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<FluidReadonlyArray<string>["keys"]>, FluidIterableIterator<number>>
>;
declare type _values_returns_fluidIterableIterator = requireTrue<
	isAssignableTo<
		ReturnType<FluidReadonlyArray<string>["values"]>,
		FluidIterableIterator<string>
	>
>;
declare type _entries_returns_fluidIterableIterator = requireTrue<
	isAssignableTo<
		ReturnType<FluidReadonlyArray<string>["entries"]>,
		FluidIterableIterator<[number, string]>
	>
>;

// FluidReadonlyArray is iterable with FluidIterableIterator
declare type _symbolIterator_returns_fluidIterableIterator = requireTrue<
	isAssignableTo<
		ReturnType<FluidReadonlyArray<string>[typeof Symbol.iterator]>,
		FluidIterableIterator<string>
	>
>;

// Array.from inference: FluidReadonlyArray<string> should produce string[], not (string | undefined)[]
declare const fluidArray: FluidReadonlyArray<string>;
declare const arrayFromFluidArray: typeof fluidArray extends Iterable<infer U> ? U[] : never;
declare type _arrayFromFluidArray_is_string_array = requireTrue<
	isAssignableTo<typeof arrayFromFluidArray, string[]>
>;

// FluidReadonlyArray supports index access
declare type _index_access = requireTrue<
	isAssignableTo<FluidReadonlyArray<string>[0], string>
>;

// FluidReadonlyArray has length
declare type _has_length = requireTrue<
	isAssignableTo<FluidReadonlyArray<string>["length"], number>
>;

// map returns a plain array
declare type _map_returns_array = requireTrue<
	isAssignableTo<ReturnType<FluidReadonlyArray<string>["map"]>, unknown[]>
>;

// filter returns a plain array
declare type _filter_returns_array = requireTrue<
	isAssignableTo<ReturnType<FluidReadonlyArray<string>["filter"]>, string[]>
>;

// slice returns a plain array
declare type _slice_returns_array = requireTrue<
	isAssignableTo<ReturnType<FluidReadonlyArray<string>["slice"]>, string[]>
>;
