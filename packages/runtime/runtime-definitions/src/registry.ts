/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A collection of entries looked up by a `type` string.
 * @remarks
 * Use of a function for this allows a few things that most collections would not:
 * 1. It's possible to generate placeholder / error values on demand.
 * 2. It makes loading from some external registry on demand practical.
 * 3. The lookup can throw an exception if appropriate
 * (the implementer can decide how to handle requests for unknown types, producing placeholders or errors).
 * 4. Generation of values can be lazy, and even asynchronous if `T` allows for a promise.
 * @input
 * @alpha
 */
export type Registry<T> = (type: string) => T;

/**
 * A strongly typed key for a {@link Registry}.
 * Use with {@link registryLookup}.
 * @remarks
 * Used to look up a `T` in a `Registry<T>`, and produce an `F` from it.
 * @privateRemarks
 * This is currently input and sealed, meaning effectively type erased since the design might change.
 * @input
 * @sealed
 * @public
 */
export interface RegistryKey<TOut, TIn = unknown> {
	/**
	 * Identifier to provide to the {@link Registry}.
	 */
	readonly type: string;

	/**
	 * Convert a value from the registry to the desired output type.
	 * @remarks
	 * How this is done is up to the implementation.
	 *
	 * This might be a type guard which throws if the input is not valid.
	 * Or it could be a conversion, an identity function, or something else.
	 *
	 * @param value - The value from the registry.
	 * @returns The converted value.
	 */
	adapt(value: TIn): TOut;
}

/**
 * Lookup an entry in a {@link Registry} using a {@link RegistryKey}.
 * @alpha
 */
export function registryLookup<TOut, TIn>(
	registry: Registry<TIn>,
	key: RegistryKey<TOut, TIn>,
): TOut {
	return key.adapt(registry(key.type));
}

/**
 * Creates a simple {@link RegistryKey} which does no type conversion.
 * @alpha
 */
export function basicKey<T>(type: string): RegistryKey<T, T> {
	return {
		type,
		adapt: (value) => value,
	};
}
