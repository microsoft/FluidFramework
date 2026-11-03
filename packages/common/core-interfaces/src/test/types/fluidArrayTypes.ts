/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { requireAssignableTo } from "@fluidframework/build-tools";
import type { FluidReadonlyArray } from "../../index.js";

// Ensure FluidReadonlyArray is assignable to readonly T[] with our current TypeScript configuration.
// Technically customers should not rely on this as doing so makes their code likely
// to break if they change the `lib` in their TypeScript configuration.
// This is however a good way to ensure we are including everything we should,
// and that the transition from us declaring we implement `readonly T[]` to `FluidReadonlyArray` is unlikely to break code
// which matches our current `lib` selection.
declare type _fluidReadonlyArray_to_readonlyArray = requireAssignableTo<
	FluidReadonlyArray<string>,
	readonly string[]
>;

// FluidReadonlyArray iteration methods return types compatible with FluidIterableIterator.
// They should explicitly return `FluidIterableIterator` but that can't be tested here as it's a structural type.
// That can instead be validated in the api reports.

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
