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
	 * Determines whether to include {@link SchemaStaticsBeta.staged | staged} allowed types in the resulting stored schema.
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
 * Marker type indicating that the input schema should not be transformed: data accessible from the simple schema API surface should be copied as is.
 * @remarks
 * The only real use-cases for this are deep-copying simple schema, and copying objects that implement more than just simple schema (such as {@link TreeSchema}) into simple object without extra prototypes and properties.
 */
export const Unchanged = Symbol("Unchanged");
export type Unchanged = typeof Unchanged;

/**
 * Subset of {@link SimpleSchemaTransformationOptions} for when the output is a known to be a stored schema.
 */
export type StoredSchemaGenerationOptions =
	| StoredFromViewSchemaGenerationOptions
	| ExpectStored;

/**
 * Options for transforming a schema.
 * @remarks
 * See also {@link generateSchemaFromSimpleSchema} for a different schema transformation.
 * Note that if we want to make `generateSchemaFromSimpleSchema` consume view simple-schema, and use these transformation APIs to generate that view simple-schema from a stored simple-schema,
 * we will need to add a "ToView" option here.
 */
export type SimpleSchemaTransformationOptions =
	| StoredFromViewSchemaGenerationOptions
	| ExpectStored
	| Unchanged;
