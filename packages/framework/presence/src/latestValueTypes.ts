/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonDeserialized } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import type { BroadcastControlSettings } from "./broadcastControls.js";
import type { InternalUtilityTypes } from "./exposedUtilityTypes.js";
import type { ISessionClient } from "./presence.js";

/**
 * Metadata for the value state.
 *
 * @sealed
 * @alpha
 */
export interface LatestValueMetadata {
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
export interface LatestValueData<T> {
	value: InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>>;
	metadata: LatestValueMetadata;

	// /**
	//  * If the value has been validated, this will contain the validated value. If it is undefined, then the value may not
	//  * be valid.
	//  */
	// validated?: T | undefined;
}

// /**
//  * Validated state of a value and its metadata.
//  *
//  * @sealed
//  * @alpha
//  */
// export interface LatestValueDataValidated<T> extends LatestValueData<T> {
// 	hasBeenValidated: true;
// }

/**
 * State of a specific client's value and its metadata.
 * @sealed
 * @alpha
 */
export interface LatestValueClientData<T> extends LatestValueData<T> {
	client: ISessionClient;
}

// /**
//  * Validated state of a specific client's value and its metadata.
//  *
//  * @sealed
//  * @alpha
//  */
// export interface LatestValueClientDataValidated<T> extends LatestValueClientData<T> {
// 	hasBeenValidated: true;
// }

/**
 * A validator function that can optionally be provided to do runtime validation of the custom data stored in a
 * presence workspace and managed by a value manager.
 *
 * @alpha
 */
export type ValueTypeSchemaValidator<T> = (
	unvalidatedData: unknown,
	metadata?: ValueTypeSchemaValidatorMetadata,
) =>
	| T
	// | ValueTypeSchemaValidator<InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>>>
	| undefined;

/**
 * Optional metadata that is passed to a {@link ValueTypeSchemaValidator}.
 *
 * @alpha
 *
 * TODO: What else needs to be in the metadata?
 */
export interface ValueTypeSchemaValidatorMetadata {
	/**
	 * If the value being validated is a LatestValueMap value, this will be set to the value of the corresponding key.
	 */
	key?: string | number;
}

/**
 * Type guard that checks if a value is a value type schema validator.
 * @param fn - A function that may be a schema validator.
 */
export function isValueTypeSchemaValidator<T>(fn: unknown): fn is ValueTypeSchemaValidator<T> {
	return typeof fn === "function";
}

/**
 * Options that can be provided to a value manager. TODO: Add details.
 *
 * @alpha
 */
export interface ValueManagerOptions<T extends object> {
	validator?: ValueTypeSchemaValidator<T>;
	controls?: BroadcastControlSettings;
}
