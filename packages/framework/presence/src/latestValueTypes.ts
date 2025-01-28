/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISessionClient } from "./presence.js";

import type { JsonDeserialized } from "@fluidframework/presence/internal/core-interfaces";
import type { InternalUtilityTypes } from "@fluidframework/presence/internal/exposedUtilityTypes";

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
}

/**
 * State of a specific client's value and its metadata.
 *
 * @sealed
 * @alpha
 */
export interface LatestValueClientData<T> extends LatestValueData<T> {
	client: ISessionClient;
}

/**
 * A validator function that can optionally be provided to do runtime validation of the custom data stored in a
 * presence workspace and managed by a value manager.
 *
 * @alpha
 */
export type ValueTypeSchemaValidator<T> = (
	unvalidatedData: unknown,
	// TODO: What else will the validator need? Stuff may be accessible via closure depending on where the validator is
	// used.
) => T | undefined;

/**
 * Not yet used. I'm wondering if accepting a function that generates a validator would be more flexible. But if all the
 * validator gets passed is the unknown blob of JSON, then maybe this isn't useful.
 * @alpha
 */
export type ValueTypeSchemaValidatorFunction<T extends object> = (
	unvalidatedData: unknown,
) => ValueTypeSchemaValidator<T> | undefined;
