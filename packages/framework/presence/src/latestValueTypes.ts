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
	value: DeepReadonly<JsonDeserialized<T>>;
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
