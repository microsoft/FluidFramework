/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeNodeSchemaIdentifier, TreeStoredSchema } from "../schema-stored/index.js";

/**
 * APIs for applying `view schema` to documents.
 */

/**
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
