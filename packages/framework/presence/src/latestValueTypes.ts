/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonDeserialized } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { InternalUtilityTypes } from "./exposedUtilityTypes.js";
import type { Attendee } from "./presence.js";

/**
 * Metadata for the value state.
 *
 * @sealed
 * @alpha
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

	// validated: boolean;
}

/**
 * Direct access to a value.
 *
 * @privateRemarks
 * Change to `InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>>` to break tsc.
 *
 * @sealed
 * @alpha
 */
export type RawValueAccessor<_T> = "raw";

/**
 * Access to a value via a function call, which may result in no value.
 *
 * @privateRemarks
 * Change to `() => InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>> | undefined` to break tsc.
 *
 * @sealed
 * @alpha
 */
export type ProxiedValueAccessor<_T> = "proxied";

/**
 * Union of possible accessor types for a value.
 *
 * @sealed
 * @alpha
 */
export type ValueAccessor<T> = RawValueAccessor<T> | ProxiedValueAccessor<T>;

/**
 * State of a value and its metadata.
 *
 * @privateRemarks
 * Set `value` to just `TValueAccessor` with above `*ValueAccessor` changes to break tsc.
 *
 * @sealed
 * @alpha
 */
export interface LatestData<T, TValueAccessor extends ValueAccessor<T>> {
	value: TValueAccessor extends RawValueAccessor<T>
		? InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>>
		: () => InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>> | undefined;
	metadata: LatestMetadata;
}

/**
 * State of a specific attendee's value and its metadata.
 *
 * @sealed
 * @alpha
 */
export interface LatestClientData<T, TValueAccessor extends ValueAccessor<T>>
	extends LatestData<T, TValueAccessor> {
	attendee: Attendee;
}

/**
 * A validator function that can optionally be provided to do runtime validation of the custom data stored in a
 * presence workspace and managed by a value manager.
 *
 * @returns The validated data, or `undefined` if the data is invalid.
 *
 * @alpha
 */
export type StateSchemaValidator<T> = (
	unvalidatedData: unknown,
	metadata?: StateSchemaValidatorMetadata,
) => JsonDeserialized<T> | undefined;

/**
 * Optional metadata that is passed to a {@link StateSchemaValidator}.
 *
 * @alpha
 *
 * TODO: What else needs to be in the metadata?
 */
export interface StateSchemaValidatorMetadata {
	/**
	 * If the value being validated is a LatestMap value, this will be set to the value of the corresponding key.
	 */
	key?: string | number;
}

/**
 * Type guard that checks if a value is a state schema validator.
 * @param fn - A function that may be a schema validator.
 */
export function isStateSchemaValidator<T extends object>(
	fn: unknown,
): fn is StateSchemaValidator<T> {
	return typeof fn === "function";
}
