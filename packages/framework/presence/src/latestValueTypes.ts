/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	DeepReadonly,
	JsonDeserialized,
	OpaqueJsonDeserialized,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { InternalTypes } from "./exposedInternalTypes.js";
import { asDeeplyReadonlyDeserializedJson } from "./internalUtils.js";
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
 * @system
 * @beta
 */
export type Accessor<
	T,
	BaseAccessor extends ValueAccessor<T>,
> = BaseAccessor extends ProxiedValueAccessor<T>
	? () => DeepReadonly<JsonDeserialized<T>> | undefined
	: BaseAccessor extends RawValueAccessor<T>
		? DeepReadonly<JsonDeserialized<T>>
		: never;

/**
 * State of a value and its metadata.
 *
 * @sealed
 * @beta
 */
export interface LatestData<T, TValueAccessor extends ValueAccessor<T>> {
	/**
	 * The value of the state or an accessor function.
	 *
	 * @remarks
	 * If the State object was created with a {@link StateSchemaValidator}, then the `value`
	 * will be a function returning a validated, deeply readonly `T` or `undefined`.
	 * Without a validator, `value` will be an unvalidated, deeply readonly `T`.
	 *
	 * Any `T` is always deeply readonly, meaning it cannot be modified.
	 */
	value: Accessor<T, TValueAccessor>;

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
 * presence workspace and managed by a state object.
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

type StateSchemaValidatorToOpaque<T> = (
	rawData: OpaqueJsonDeserialized<T>,
) => OpaqueJsonDeserialized<T> | undefined;

function createGetterFunction<T>(
	clientState: InternalTypes.ValueRequiredState<T>,
	validator: StateSchemaValidatorToOpaque<T>,
): () => DeepReadonly<JsonDeserialized<T>> | undefined {
	return (): DeepReadonly<JsonDeserialized<T>> | undefined => {
		if (!("validatedValue" in clientState)) {
			// Stored `value` has not been validated yet.
			clientState.validatedValue = validator(clientState.value);
		}
		return asDeeplyReadonlyDeserializedJson(clientState.validatedValue);
	};
}

/**
 * Creates a getter for a state value that validates the data with a validator if one is provided. Otherwise the value
 * is returned directly.
 *
 * @param clientState - The client state to be validated.
 * @param validator - The validator function to run.
 * @returns Either returns the value directly if a validator is not provided, or a function that will return the
 * validated data.
 */
export function createValidatedGetter<T>(
	clientState: InternalTypes.ValueRequiredState<T>,
	validator: StateSchemaValidator<T> | undefined,
): (() => DeepReadonly<JsonDeserialized<T>> | undefined) | DeepReadonly<JsonDeserialized<T>> {
	if (validator === undefined) {
		return asDeeplyReadonlyDeserializedJson(clientState.value);
	}

	return createGetterFunction(clientState, validator as StateSchemaValidatorToOpaque<T>);
}
