/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	GlobalFieldKey,
	TreeSchemaIdentifier,
	SchemaPolicy,
	SchemaData,
	FieldStoredSchema,
} from "../schema-stored";

/**
 * APIs for applying `view schema` to documents.
 */

/**
 * How compatible a particular view schema is for some operation on some specific document.
 */
export enum Compatibility {
	Incompatible,
	// For write compatibility this can include compatible schema updates to stored schema.
	// TODO: separate schema updates from adapters.
	RequiresAdapters,
	Compatible,
}

/**
 * What kinds of updates to stored schema to permit.
 *
 * TODO:
 * Currently this does not account for lazy schema updates, and/or use of adapters.
 * @alpha
 */
export enum AllowedUpdateType {
	/**
	 * Do not update the stored schema to match view schema.
	 */
	None,
	/**
	 * Update the stored schema to match the view schema if the current document contents are compatible with the view schema.
	 * TODO: support this option.
	 */
	// DataCompatible,
	/**
	 * Update the stored schema to match view schema if all possible documents based on the current stored schema would be compatible with the view schema.
	 */
	SchemaCompatible,
}

/**
 * @alpha
 */
export interface TreeAdapter {
	readonly output: TreeSchemaIdentifier;
	readonly input: TreeSchemaIdentifier;

	// TODO: include actual adapter functionality, not just what types it converts
}

/**
 * @alpha
 */
export interface FieldAdapter {
	readonly field: GlobalFieldKey;

	convert(stored: FieldStoredSchema): FieldStoredSchema;
	// TODO: include actual adapter functionality (to provide the missing values), not just what types it converts
}

/**
 * Minimal selection of adapters (nothing for general out of schema, field level adjustments etc.).
 * Would be used with schematize and have actual conversion/update functionality.
 *
 * TODO: Support more kinds of adapters
 * TODO: support efficient lookup of adapters
 * @alpha
 */
export interface Adapters {
	readonly tree?: readonly TreeAdapter[];
	/**
	 * Handlers for when a fields is missing.
	 */
	readonly fieldAdapters?: ReadonlyMap<GlobalFieldKey, FieldAdapter>;
}

/**
 * A collection of View information for schema, including policy.
 */
export abstract class ViewSchemaData<TPolicy extends SchemaPolicy = SchemaPolicy> {
	public constructor(public readonly policy: TPolicy, public readonly adapters: Adapters) {}

	/**
	 * Determines the compatibility of a stored document
	 * (based on its stored schema) with a viewer (based on its view schema).
	 *
	 * Adapters can be provided to handle differences between the two schema.
	 * Adapters should only use to types in the `view` SchemaRepository.
	 *
	 * TODO: this API violates the parse don't validate design philosophy.
	 * It should be wrapped with (or replaced by) a parse style API.
	 */
	public abstract checkCompatibility(stored: SchemaData): {
		read: Compatibility;
		write: Compatibility;
		writeAllowingStoredSchemaUpdates: Compatibility;
	};
}

/**
 * A collection of View information for schema, including policy.
 */
export class AdaptedViewSchema {
	public constructor(
		public readonly adapters: Adapters,
		public readonly adaptedForViewSchema: SchemaData,
	) {}
}
