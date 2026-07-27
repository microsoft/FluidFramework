/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { requireAssignableTo } from "@fluidframework/build-tools";
import type { FluidIterableIterator, FluidReadonlyArray } from "../../index.js";

// FluidReadonlyArray is assignable to readonly T[].
// This is the key invariant: users who treat our array nodes as readonly arrays must not break.
declare type _fluidReadonlyArray_to_readonlyArray = requireAssignableTo<
	FluidReadonlyArray<string>,
	readonly string[]
>;

// FluidReadonlyArray iteration methods return FluidIterableIterator
declare type _keys_returns_fluidIterableIterator = requireAssignableTo<
	ReturnType<FluidReadonlyArray<string>["keys"]>,
	FluidIterableIterator<number>
>;
declare type _values_returns_fluidIterableIterator = requireAssignableTo<
	ReturnType<FluidReadonlyArray<string>["values"]>,
	FluidIterableIterator<string>
>;
declare type _entries_returns_fluidIterableIterator = requireAssignableTo<
	ReturnType<FluidReadonlyArray<string>["entries"]>,
	FluidIterableIterator<[number, string]>
>;

// FluidReadonlyArray is iterable with FluidIterableIterator
declare type _symbolIterator_returns_fluidIterableIterator = requireAssignableTo<
	ReturnType<FluidReadonlyArray<string>[typeof Symbol.iterator]>,
	FluidIterableIterator<string>
>;

// Array.from inference: FluidReadonlyArray<string> should produce string[]
declare const fluidArray: FluidReadonlyArray<string>;
declare const arrayFromFluidArray: typeof fluidArray extends Iterable<infer U> ? U[] : never;
declare type _arrayFromFluidArray_is_string_array = requireAssignableTo<
	typeof arrayFromFluidArray,
	string[]
>;

// FluidReadonlyArray supports index access
declare type _index_access = requireAssignableTo<FluidReadonlyArray<string>[0], string>;

// FluidReadonlyArray has length
declare type _has_length = requireAssignableTo<FluidReadonlyArray<string>["length"], number>;

// map returns a plain array
declare type _map_returns_array = requireAssignableTo<
	ReturnType<FluidReadonlyArray<string>["map"]>,
	unknown[]
>;

// filter returns a plain array
declare type _filter_returns_array = requireAssignableTo<
	ReturnType<FluidReadonlyArray<string>["filter"]>,
	string[]
>;

// slice returns a plain array
declare type _slice_returns_array = requireAssignableTo<
	ReturnType<FluidReadonlyArray<string>["slice"]>,
	string[]
>;
