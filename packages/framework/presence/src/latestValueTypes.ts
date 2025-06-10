/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	DeepReadonly,
	JsonDeserialized,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { Attendee } from "./presence.js";

/**
 * Metadata for the value state.
 *
 * @sealed
 * @beta
 */
export interface LatestMetadata {
	/**
	 * The revision number for value that increases as value is changed.
	 */
	revision: number;
	/**
	 * Local time when the value was last updated.
	 * @remarks Currently this is a placeholder for future implementation.
	 */
	timestamp: number;
}

/**
 * Represents a value that is accessed directly.
 *
 * @system
 * @beta
 */
export interface RawValueAccessor<T> {
	readonly kind: "raw";
	readonly data: T;
}

/**
 * Represents a value that is accessed via a function call, which may result in no value.
 *
 * @system
 * @beta
 */
export interface ProxiedValueAccessor<T> {
	readonly kind: "proxied";
	readonly data: T;
}

/**
 * Union of possible accessor types for a value.
 *
 * @system
 * @beta
 */
export type ValueAccessor<T> = RawValueAccessor<T> | ProxiedValueAccessor<T>;

/**
 * Utility type that conditionally represents an accessor type based on the base accessor type.
 *
 * @beta
 */
export type Accessor<
	V,
	TAccessor extends ValueAccessor<V>,
> = TAccessor extends ProxiedValueAccessor<V>
	? () => DeepReadonly<JsonDeserialized<V>> | undefined
	: TAccessor extends RawValueAccessor<V>
		? DeepReadonly<JsonDeserialized<V>>
		: never;

/**
 * State of a value and its metadata.
 *
 * @privateRemarks
 * Set `value` to just `TValueAccessor` with above `*ValueAccessor` changes to break tsc.
 *
 * @system
 * @beta
 */
export interface LatestData<T, TValueAccessor extends ValueAccessor<T>> {
	/**
	 * The value of the state.
	 *
	 * @remarks
	 *
	 * This is a deeply readonly value, meaning it cannot be modified.
	 *
	 * @privateRemarks
	 *
	 * Ideally this type would be `Accessor<T, TValueAccessor>`, but using that instead of this exact definition causes
	 * TypeScript compilation to crash with an out-of-memory error.
	 */
	value: TValueAccessor extends ProxiedValueAccessor<T>
		? () => DeepReadonly<JsonDeserialized<T>> | undefined
		: TValueAccessor extends RawValueAccessor<T>
			? DeepReadonly<JsonDeserialized<T>>
			: never;

	/**
	 * Metadata associated with the value.
	 */
	metadata: LatestMetadata;
}

/**
 * State of a specific {@link Attendee}'s value and its metadata.
 *
 * @sealed
 * @beta
 */
export interface LatestClientData<
	T,
	TValueAccessor extends ValueAccessor<T> = ProxiedValueAccessor<T>,
> extends LatestData<T, TValueAccessor> {
	/**
	 * Associated {@link Attendee}.
	 */
	attendee: Attendee;
}

/**
 * A validator function that can optionally be provided to do runtime validation of the custom data stored in a
 * presence workspace and managed by a value manager.
 *
 * @param unvalidatedData - The unknown data that should be validated. **This data should not be mutated.**
 *
 * @returns The validated data, or `undefined` if the data is invalid.
 *
 * @beta
 */
export type StateSchemaValidator<T> = (
	/**
	 * Unknown data that should be validated. **This data should not be mutated.**
	 */
	unvalidatedData: unknown,
) => JsonDeserialized<T> | undefined;
