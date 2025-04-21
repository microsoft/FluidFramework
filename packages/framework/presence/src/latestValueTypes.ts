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
export interface LatestRawMetadata {
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
export interface LatestRawData<T> {
	value: InternalUtilityTypes.FullyReadonly<JsonDeserialized<T>>;
	metadata: LatestRawMetadata;
}

/**
 * State of a specific attendee's value and its metadata.
 *
 * @sealed
 * @alpha
 */
export interface LatestRawClientData<T> extends LatestRawData<T> {
	attendee: Attendee;
}
