/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	DeepReadonly,
	JsonDeserialized,
	OpaqueJsonDeserialized,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import { asDeeplyReadonlyDeserializedJson } from "./internalUtils.js";
import type { StateSchemaValidator } from "./latestValueTypes.js";
import type { ValidatableRequiredState } from "./validatableTypes.js";

type StateSchemaValidatorToOpaque<T> = (
	rawData: OpaqueJsonDeserialized<T>,
) => OpaqueJsonDeserialized<T> | undefined;

function createGetterFunction<T>(
	clientState: ValidatableRequiredState<T>,
	validator: StateSchemaValidatorToOpaque<T>,
): () => DeepReadonly<JsonDeserialized<T>> | undefined {
	return (): DeepReadonly<JsonDeserialized<T>> | undefined => {
		if (!("validatedValue" in clientState)) {
			// Stored `value` has not been validated yet, so validate it and save the result.
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
	clientState: ValidatableRequiredState<T>,
	validator: StateSchemaValidator<T> | undefined,
): (() => DeepReadonly<JsonDeserialized<T>> | undefined) | DeepReadonly<JsonDeserialized<T>> {
	// No validator
	if (validator === undefined) {
		return asDeeplyReadonlyDeserializedJson(clientState.value);
	}

	// Avoid creating another function since one already exists on the item
	if (typeof clientState.value === "function") {
		return clientState.value;
	}

	// OpaqueJsonDeserialized<T> is just a branded alias of JsonDeserialized<T>. At runtime the functions are still passed
	// JSON data, regardless of their type representation. Passing that data to a function that expects `unknown`, like
	// the user-provided validator function, is always valid, so StateSchemaValidator and StateSchemaValidatorToOpaque are
	// functionally equivalent.
	return createGetterFunction(clientState, validator as StateSchemaValidatorToOpaque<T>);
}
