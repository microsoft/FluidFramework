/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { requireAssignableTo } from "@fluidframework/build-tools";
import type {
	FluidIterable,
	FluidIterableIterator,
	FluidMap,
	FluidReadonlyMap,
} from "../../index.js";

// FluidMap extends FluidReadonlyMap
declare type _fluidMap_to_fluidReadonlyMap = requireAssignableTo<
	FluidMap<string, number>,
	FluidReadonlyMap<string, number>
>;

// Ensure FluidReadonlyMap is assignable to ReadonlyMap with our current TypeScript configuration.
// Technically customers should not rely on this as doing so makes their code likely
// to break if they change the `lib` in their TypeScript configuration.
// This is however a good way to ensure we are including everything we should,
// and that the transition from us declaring we implement `ReadonlyMap` to `FluidReadonlyMap` is unlikely to break code
// which matches our current `lib` selection.
declare type _fluidReadonlyMap_to_readonlyMap = requireAssignableTo<
	FluidReadonlyMap<string, number>,
	ReadonlyMap<string, number>
>;

// Sanity check: native Map is assignable to FluidReadonlyMap.
// This is not an invariant users can depend on — if we implement standard APIs added to built-in types
// before updating our TypeScript `lib` to include them, this check could fail.
// It serves as a useful sanity check that our type is reasonable.
declare type _map_to_fluidReadonlyMap = requireAssignableTo<
	Map<string, number>,
	FluidReadonlyMap<string, number>
>;

// Sanity check: native iterables are assignable to FluidIterable.
// Same caveat as above — not an invariant, just a sanity check.
declare type _map_to_fluidIterable = requireAssignableTo<
	Map<string, number>,
	FluidIterable<[string, number]>
>;
declare type _set_to_fluidIterable = requireAssignableTo<Set<string>, FluidIterable<string>>;
declare type _array_to_fluidIterable = requireAssignableTo<string[], FluidIterable<string>>;

// Native iterator return types are compatible with FluidIterableIterator.
// This can't be meaningfully tested here since FluidIterableIterator is structural —
// assignability would pass even if our methods returned the built-in type.
// Validate in API reports instead.

// Array.from inference tests
// The done branch of FluidIterableIterator uses `any` (not `undefined`) so that
// Array.from and other call sites infer the element type as T, not T | undefined.

// Array.from on a FluidIterableIterator<string> should produce string[]
declare const stringIter: FluidIterableIterator<string>;
declare type _arrayFromIterator = requireAssignableTo<
	typeof arrayFromIteratorResult,
	string[]
>;
declare const arrayFromIteratorResult: ReturnType<typeof Array.from<string>>;
// Verify that the actual Array.from call infers correctly:
declare const arrayFromFluidIter: typeof stringIter extends Iterable<infer U> ? U[] : never;
declare type _arrayFromFluidIter_is_string_array = requireAssignableTo<
	typeof arrayFromFluidIter,
	string[]
>;

// Array.from on a FluidReadonlyMap should produce [K, V][]
declare const fluidMap: FluidReadonlyMap<string, number>;
declare const arrayFromFluidMap: typeof fluidMap extends Iterable<infer U> ? U[] : never;
declare type _arrayFromFluidMap_is_entry_array = requireAssignableTo<
	typeof arrayFromFluidMap,
	[string, number][]
>;
