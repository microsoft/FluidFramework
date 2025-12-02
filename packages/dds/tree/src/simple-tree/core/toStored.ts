/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { SchemaUpgrade } from "./allowedTypes.js";

/**
 * Options for transforming a view simple-schema to a stored simple-schema (See {@link TreeStoredSchema}).
 */
export interface StoredFromViewSchemaGenerationOptions {
	/**
	 * Determines whether to include staged schema in the resulting stored schema.
	 * @remarks
	 * Due to caching, the behavior of this function must be pure.
	 */
	includeStaged(upgrade: SchemaUpgrade): boolean;

	/**
	 * If true, non-stored data (data only relevant to view schema) will be discarded from the resulting stored schema.
	 * @remarks
	 * This includes metadata which is not persisted as part of the stored schema.
	 */
	discardNonStoredData?: undefined | true;
}

/**
 * Marker type indicating that the input schema is already a stored schema.
 */
export const ExpectStored = Symbol("ExpectStored");
export type ExpectStored = typeof ExpectStored;

/**
 * Marker type indicating that the input schema is already a stored schema.
 */
export const Unchanged = Symbol("Unchanged");
export type Unchanged = typeof Unchanged;

/**
 * Marker type indicating that the input schema is already a stored schema.
 */
export const ToView = Symbol("ToView");
export type ToView = typeof ToView;

export type StoredSchemaGenerationOptions =
	| StoredFromViewSchemaGenerationOptions
	| ExpectStored;

export type SimpleSchemaTransformationOptions =
	| StoredFromViewSchemaGenerationOptions
	| ExpectStored
	| Unchanged;
//	| ToView; // Maybe include this

export function isStoredFromView(
	options: SimpleSchemaTransformationOptions,
): options is StoredFromViewSchemaGenerationOptions {
	return options !== ExpectStored;
}

export function filterViewData<T>(
	options: SimpleSchemaTransformationOptions,
	data: T,
): T | undefined {
	return preservesViewData(options) ? undefined : data;
}

export function preservesViewData(options: SimpleSchemaTransformationOptions): boolean {
	return isStoredFromView(options) && options.discardNonStoredData === true ? false : true;
}
