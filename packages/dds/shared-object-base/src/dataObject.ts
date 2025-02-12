/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";

import type { SharedObjectKind } from "./sharedObject.js";

/**
 * Utilities for creating SharedObjectKind instances for data objects.
 *
 * @remarks
 * These utilities really probably belong in the `aqueduct` library, but must live here for now to avoid upstream build issues.
 * TODO: Move these utilities to the `aqueduct` library.
 */

/**
 * An object that has a factory that can create a data object.
 *
 * @typeParam T - The type of the data object.
 *
 * @internal
 */
export type DataObjectKind<T = unknown> = {
	readonly factory: IFluidDataStoreFactory;
} & (
	| {
			// Not actually used, but required for strong typing.
			readonly makeCovariant?: T;
	  }
	// Not actually used, but helps with strong typing.
	| (new (
			...args: never[]
	  ) => T)
);

/**
 * Utility for creating SharedObjectKind instances for data objects.
 *
 * @typeParam T - {@link DataObjectKind}.
 *
 * @internal
 */
export function createDataObjectKind<T extends DataObjectKind>(
	factory: T,
): T & SharedObjectKind<T extends DataObjectKind<infer I> ? I : unknown> {
	return factory as T & SharedObjectKind<T extends DataObjectKind<infer I> ? I : unknown>;
}
