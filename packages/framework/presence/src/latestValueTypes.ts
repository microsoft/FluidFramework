/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	DeepReadonly,
	JsonDeserialized,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { InternalTypes } from "./exposedInternalTypes.js";
import { asDeeplyReadonly } from "./internalUtils.js";
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
}

/**
 * Represents a value that is accessed directly.
 *
 * @sealed
 * @alpha
 */
export type RawValueAccessor<_T> = "raw";

/**
 * Represents a value that is accessed via a function call, which may result in no value.
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
 * @alpha
 */
export type Accessor<T extends ValueAccessor<T>> = T extends ProxiedValueAccessor<T>
	? () => DeepReadonly<JsonDeserialized<T>> | undefined
	: T extends RawValueAccessor<T>
		? DeepReadonly<JsonDeserialized<T>>
		: never;

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
	value: TValueAccessor extends ProxiedValueAccessor<T>
		? () => DeepReadonly<JsonDeserialized<T>> | undefined
		: TValueAccessor extends RawValueAccessor<T>
			? DeepReadonly<JsonDeserialized<T>>
			: never;
	// value: Accessor<TValueAccessor>;
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
 * @param unvalidatedData - The unknown data that should be validated. **This data should not be mutated.**
 *
 * @returns The validated data, or `undefined` if the data is invalid.
 *
 * @alpha
 */
export type StateSchemaValidator<T> = (
	/**
	 * Unknown data that should be validated. **This data should not be mutated.**
	 */
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
 * Creates a getter for a state value that validates the data with a validator if one is provided.
 *
 * @param clientState - The client state to be validated.
 * @param validator - The validator function to run.
 * @returns A function that will validate the data, returning the validated data if it was valid, and `undefined`
 * otherwise.
 */
export function createValidatedGetter<T>(
	clientState: InternalTypes.ValueRequiredState<T> | InternalTypes.ValueOptionalState<T>,
	validator?: StateSchemaValidator<T>,
): () => DeepReadonly<JsonDeserialized<T>> | undefined {
	return () => {
		if (validator === undefined) {
			// No validator, so return the raw value
			return asDeeplyReadonly(clientState.value);
		}

		if (clientState.validated === true) {
			// Data was previously validated, so return the validated value, which may be undefined.
			return asDeeplyReadonly(clientState.validatedValue);
		}

		const validData = validator(clientState.value);
		clientState.validated = true;
		// FIXME: Cast shouldn't be needed
		clientState.validatedValue = validData as JsonDeserialized<T>;
		return asDeeplyReadonly(clientState.validatedValue);
	};
}
