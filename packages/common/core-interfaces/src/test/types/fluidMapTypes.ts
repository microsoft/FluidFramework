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

// Suppress noUnusedLocals for the imports & utilities above.
declare type MakeUnusedImportErrorsGoAway =
	| requireTrue<true>
	| requireFalse<false>
	| isAssignableTo<true, true>
	| FluidIterable<unknown>
	| FluidIterableIterator<unknown>
	| FluidMap<unknown, unknown>
	| FluidReadonlyMap<unknown, unknown>;

// --- FluidReadonlyMap <-> built-in ReadonlyMap ---

// A native ReadonlyMap is NOT assignable to FluidReadonlyMap because FluidReadonlyMap
// has [Symbol.toStringTag], which ReadonlyMap lacks.
declare type readonlyMap_to_fluidReadonlyMap = requireFalse<
	isAssignableTo<ReadonlyMap<string, number>, FluidReadonlyMap<string, number>>
>;

// FluidReadonlyMap is assignable to Omit<ReadonlyMap, "forEach"> (forEach callback's map parameter differs).
declare type fluidReadonlyMap_to_readonlyMap = requireTrue<
	isAssignableTo<
		FluidReadonlyMap<string, number>,
		Omit<ReadonlyMap<string, number>, "forEach">
	>
>;

// --- Inter-Fluid type relationships ---

// FluidMap is assignable to FluidReadonlyMap (extends it).
declare type fluidMap_to_fluidReadonlyMap = requireTrue<
	isAssignableTo<FluidMap<string, number>, FluidReadonlyMap<string, number>>
>;

// FluidReadonlyMap is NOT assignable to FluidMap (missing mutable members).
declare type fluidReadonlyMap_to_fluidMap = requireFalse<
	isAssignableTo<FluidReadonlyMap<string, number>, FluidMap<string, number>>
>;

// --- Native Map assignable to FluidReadonlyMap (read-only subset) ---

declare type map_to_fluidReadonlyMap = requireTrue<
	isAssignableTo<Map<string, number>, FluidReadonlyMap<string, number>>
>;

// --- FluidIterable: native iterables are assignable ---

declare type map_to_fluidIterable = requireTrue<
	isAssignableTo<Map<string, number>, FluidIterable<[string, number]>>
>;
declare type set_to_fluidIterable = requireTrue<
	isAssignableTo<Set<string>, FluidIterable<string>>
>;
declare type array_to_fluidIterable = requireTrue<
	isAssignableTo<string[], FluidIterable<string>>
>;

// --- FluidIterableIterator: native iterators are assignable ---

declare type mapKeys_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<Map<string, number>["keys"]>, FluidIterableIterator<string>>
>;
declare type mapValues_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<Map<string, number>["values"]>, FluidIterableIterator<number>>
>;
declare type mapEntries_to_fluidIterableIterator = requireTrue<
	isAssignableTo<
		ReturnType<Map<string, number>["entries"]>,
		FluidIterableIterator<[string, number]>
	>
>;
declare type setKeys_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<Set<string>["keys"]>, FluidIterableIterator<string>>
>;
declare type arrayKeys_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<string[]["keys"]>, FluidIterableIterator<number>>
>;
declare type arrayValues_to_fluidIterableIterator = requireTrue<
	isAssignableTo<ReturnType<string[]["values"]>, FluidIterableIterator<string>>
>;
