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
