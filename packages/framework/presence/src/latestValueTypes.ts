/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DeepReadonly, JsonDeserialized } from "@fluidframework/core-interfaces/internal";

import type { InternalTypes } from "./exposedInternalTypes.js";
import {
	asDeeplyReadonlyDeserializedJson,
	revealOpaqueJson,
	toOpaqueJson,
} from "./internalUtils.js";
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
	 * The value of the state. This will either be a value or a function that can be called to retrieve the value.
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

/**
 * Optional metadata that is passed to a {@link StateSchemaValidator}.
 *
 * @beta
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
	const getterFunction = (): DeepReadonly<JsonDeserialized<T>> | undefined => {
		const valueToCheck =
			validator === undefined
				? // No validator, so use the raw value
					clientState.value
				: clientState.validated === true
					? // Stored value has been validated, so return it without revalidating
						clientState.validatedValue
					: // Use false to signal that value needs to be validated
						false;

		if (valueToCheck !== false) {
			return valueToCheck === undefined
				? undefined
				: asDeeplyReadonlyDeserializedJson(valueToCheck);
		}

		// @ts-expect-error Type 'null' is not assignable to type 'T | undefined'.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const validData: T | undefined = validator!(
			clientState.value === undefined ? undefined : revealOpaqueJson(clientState.value),
		);
		clientState.validated = true;
		clientState.validatedValue =
			// @ts-expect-error Argument of type 'T & ({} | null)' is not assignable to parameter of type
			validData === undefined ? undefined : toOpaqueJson(validData);
		return clientState.validatedValue === undefined
			? undefined
			: asDeeplyReadonlyDeserializedJson(clientState.validatedValue);
	};
	return getterFunction;
}
