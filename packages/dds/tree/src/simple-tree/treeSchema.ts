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
	FieldKind,
} from "./fieldSchema.js";
import type { SchemaType, SimpleNodeSchema, SimpleTreeSchema } from "./simpleSchema.js";
import { walkFieldSchema } from "./walkFieldSchema.js";

/**
 * Normalizes a root schema and collects its reachable node definitions.
 * @param rootSchema - The schema to use at the tree root.
 * @returns The normalized root field and its reachable node definitions.
 * @throws A usage error for a counter root or conflicting node schema identifiers.
 * Counter accessors are supported only on object fields.
 */
export function createTreeSchema(rootSchema: ImplicitFieldSchema): TreeSchema {
	const root = normalizeFieldSchema(rootSchema);
	if (root.kind === FieldKind.Counter) {
		throw new UsageError("Counter fields are supported only on object nodes, not at the root");
	}
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
	readonly root: FieldSchemaAlpha;

	readonly definitions: ReadonlyMap<
		string,
		SimpleNodeSchema<SchemaType.View> & TreeNodeSchema
	>;
}
