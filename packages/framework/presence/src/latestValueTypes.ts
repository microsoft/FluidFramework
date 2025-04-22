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
}

/**
 * State of a value and its metadata.
 *
 * @sealed
 * @alpha
 */
export interface LatestData<T> {
	value: InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>> | undefined;
	metadata: LatestMetadata;
}

/**
 * State of a specific attendee's value and its metadata.
 *
 * @sealed
 * @alpha
 */
export interface LatestClientData<T> extends LatestData<T> {
	attendee: Attendee;
}

/**
 * A validator function that can optionally be provided to do runtime validation of the custom data stored in a
 * presence workspace and managed by a value manager.
 *
 * @alpha
 */
export type StateSchemaValidator<T> = (
	unvalidatedData: unknown,
	metadata?: StateSchemaValidatorMetadata,
) => T | undefined;

/**
 * Optional metadata that is passed to a {@link StateSchemaValidator}.
 *
 * @alpha
 *
 * TODO: What else needs to be in the metadata?
 */
export interface StateSchemaValidatorMetadata {
	/**
	 * If the value being validated is a LatestValueMap value, this will be set to the value of the corresponding key.
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
