/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	FluidIterable,
	FluidIterableIterator,
	FluidMap,
	FluidReadonlyMap,
} from "../../index.js";

// Compile-time type utilities (same pattern as the generated type tests in this package).
type requireTrue<_X extends true> = true;
type requireFalse<_X extends false> = true;
type isAssignableTo<Source, Destination> = [Source] extends [Destination] ? true : false;

// Native ReadonlyMap is NOT assignable to FluidReadonlyMap because
// FluidReadonlyMap requires [Symbol.toStringTag], which ReadonlyMap lacks.
declare type _readonlyMap_to_fluidReadonlyMap = requireFalse<
	isAssignableTo<ReadonlyMap<string, number>, FluidReadonlyMap<string, number>>
>;

// FluidMap extends FluidReadonlyMap
declare type _fluidMap_to_fluidReadonlyMap = requireTrue<
	isAssignableTo<FluidMap<string, number>, FluidReadonlyMap<string, number>>
>;

// FluidReadonlyMap is assignable to ReadonlyMap (the extra Symbol.toStringTag is compatible).
declare type _fluidReadonlyMap_to_readonlyMap = requireTrue<
	isAssignableTo<FluidReadonlyMap<string, number>, ReadonlyMap<string, number>>
>;

// Native Map is assignable to FluidReadonlyMap
declare type _map_to_fluidReadonlyMap = requireTrue<
	isAssignableTo<Map<string, number>, FluidReadonlyMap<string, number>>
>;

// Native iterables are assignable to FluidIterable
declare type _map_to_fluidIterable = requireTrue<
	isAssignableTo<Map<string, number>, FluidIterable<[string, number]>>
>;
declare type _set_to_fluidIterable = requireTrue<
	isAssignableTo<Set<string>, FluidIterable<string>>
>;
declare type _array_to_fluidIterable = requireTrue<
	isAssignableTo<string[], FluidIterable<string>>
>;

// Native iterators are assignable to FluidIterableIterator
declare type _mapKeys_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<Map<string, number>["keys"]>, FluidIterableIterator<string>>
>;
declare type _mapValues_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<Map<string, number>["values"]>, FluidIterableIterator<number>>
>;
declare type _mapEntries_to_fluidIterableIterator = requireTrue<
	isAssignableTo<
		ReturnType<Map<string, number>["entries"]>,
		FluidIterableIterator<[string, number]>
	>
>;
declare type _setKeys_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<Set<string>["keys"]>, FluidIterableIterator<string>>
>;
declare type _arrayKeys_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<string[]["keys"]>, FluidIterableIterator<number>>
>;
declare type _arrayValues_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<string[]["values"]>, FluidIterableIterator<string>>
>;

// Array.from inference tests
// The done branch of FluidIterableIterator uses `any` (not `undefined`) so that
// Array.from and other call sites infer the element type as T, not T | undefined.

// Array.from on a FluidIterableIterator<string> should produce string[], not (string | undefined)[].
declare const stringIter: FluidIterableIterator<string>;
declare type _arrayFromIterator = requireTrue<
	isAssignableTo<typeof arrayFromIteratorResult, string[]>
>;
declare const arrayFromIteratorResult: ReturnType<typeof Array.from<string>>;
// Verify that the actual Array.from call infers correctly:
declare const arrayFromFluidIter: typeof stringIter extends Iterable<infer U> ? U[] : never;
declare type _arrayFromFluidIter_is_string_array = requireTrue<
	isAssignableTo<typeof arrayFromFluidIter, string[]>
>;

// Array.from on a FluidReadonlyMap should produce [K, V][], not ([K, V] | undefined)[].
declare const fluidMap: FluidReadonlyMap<string, number>;
declare const arrayFromFluidMap: typeof fluidMap extends Iterable<infer U> ? U[] : never;
declare type _arrayFromFluidMap_is_entry_array = requireTrue<
	isAssignableTo<typeof arrayFromFluidMap, [string, number][]>
>;
