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
// export const ToView = Symbol("ToView");
// export type ToView = typeof ToView;

export type StoredSchemaGenerationOptions =
	| StoredFromViewSchemaGenerationOptions
	| ExpectStored;

export type SimpleSchemaTransformationOptions =
	| StoredFromViewSchemaGenerationOptions
	| ExpectStored
	| Unchanged;
//	| ToView; // Maybe include this

function isStoredFromView(
	options: SimpleSchemaTransformationOptions,
): options is StoredFromViewSchemaGenerationOptions {
	return typeof options === "object" && "includeStaged" in options;
}

export function filterViewData<T>(
	options: SimpleSchemaTransformationOptions,
	data: T,
): T | undefined {
	return preservesViewData(options) ? undefined : data;
}

export function preservesViewData(options: SimpleSchemaTransformationOptions): boolean {
	return isStoredFromView(options) ? false : options === Unchanged;
}
