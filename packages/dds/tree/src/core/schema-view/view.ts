/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeNodeSchemaIdentifier, TreeStoredSchema } from "../schema-stored/index.js";

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
	// RequiresAdapters,
	Compatible,
}

/**
 * What kinds of updates to stored schema to permit.
 *
 * Bit flags enum.
 * @internal
 */
export enum AllowedUpdateType {
	/**
	 * Do not update the stored schema to match view schema.
	 */
	None = 0,
	/**
	 * Update the stored schema as part of initializing an empty document.
	 *
	 * Includes "Initialize".
	 */
	// eslint-disable-next-line no-bitwise
	Initialize = 1 << 0,
	/**
	 * Update the stored schema to match the view schema if the current document contents are compatible with the view schema.
	 * TODO: support this option.
	 */
	// DataCompatible,
	/**
	 * Update the stored schema to match view schema if all possible documents based on the current stored schema would be compatible with the view schema.
	 *
	 * Includes "Initialize".
	 */
	// eslint-disable-next-line no-bitwise
	SchemaCompatible = 1 << 1,
}

/**
 * @internal
 */
export interface TreeAdapter {
	readonly output: TreeNodeSchemaIdentifier;
	readonly input: TreeNodeSchemaIdentifier;

	// TODO: include actual adapter functionality, not just what types it converts
}

/**
 * Minimal selection of adapters (nothing for general out of schema, field level adjustments etc.).
 * Would be used with schematize and have actual conversion/update functionality.
 *
 * TODO: Support more kinds of adapters
 * TODO: support efficient lookup of adapters
 * @internal
 */
export interface Adapters {
	readonly tree?: readonly TreeAdapter[];
}

/**
 * A collection of View information for schema, including policy.
 */
export class AdaptedViewSchema {
	public constructor(
		public readonly adapters: Adapters,
		public readonly adaptedForViewSchema: TreeStoredSchema,
	) {}
}
