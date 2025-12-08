/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TreeNodeSchema } from "./core/index.js";
import {
	type FieldSchemaAlpha,
	type ImplicitFieldSchema,
	normalizeFieldSchema,
} from "./fieldSchema.js";
import type { SchemaType, SimpleNodeSchema, SimpleTreeSchema } from "./simpleSchema.js";
import { walkFieldSchema } from "./walkFieldSchema.js";

export function createTreeSchema(rootSchema: ImplicitFieldSchema): TreeSchema {
	const root = normalizeFieldSchema(rootSchema);
	const definitions = new Map<string, SimpleNodeSchema<SchemaType.View> & TreeNodeSchema>();

	walkFieldSchema(root, {
		node: (schema) => {
			if (definitions.has(schema.identifier)) {
				throw new UsageError(
					`Multiple schema encountered with the identifier ${JSON.stringify(schema.identifier)}. Remove or rename them to avoid the collision.`,
				);
			}
			definitions.set(
				schema.identifier,
				schema as SimpleNodeSchema<SchemaType.View> & TreeNodeSchema,
			);
		},
	});

	return { root, definitions };
}

/**
 * {@link TreeViewConfigurationAlpha}
 * @sealed @alpha
 */
export interface TreeSchema extends SimpleTreeSchema<SchemaType.View> {
	/**
	 * {@inheritDoc SimpleTreeSchema.root}
	 */
	readonly root: FieldSchemaAlpha;

	/**
	 * {@inheritDoc SimpleTreeSchema.definitions}
	 */
	readonly definitions: ReadonlyMap<
		string,
		SimpleNodeSchema<SchemaType.View> & TreeNodeSchema
	>;
}
