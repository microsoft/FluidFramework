/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase, fail } from "@fluidframework/core-utils/internal";
import { NodeKind, type TreeNodeSchema } from "../core/index.js";
import {
	type FieldSchema,
	type AllowedTypes,
	type FieldSchemaAlpha,
	FieldKind,
} from "../schemaTypes.js";
import { SchemaFactory } from "./schemaFactory.js";
import type {
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleTreeSchema,
} from "../simpleSchema.js";
import { SchemaFactoryAlpha } from "./schemaFactoryAlpha.js";

const factory = new SchemaFactoryAlpha(undefined);

/**
 * Create {@link FieldSchema} from a SimpleTreeSchema.
 * @remarks
 * Only use this API if hand written schema (produced using {@link SchemaFactory} cannot be provided.
 *
 * Using generated schema with schema aware APIs (designed to work with strongly typed schema) like {@link TreeViewConfiguration}
 * will produce a poor TypeScript typing experience which is subject to change.
 *
 * Editing through a view produced using this schema can easily violate invariants other users of the document might expect and must be done with great care.
 * @alpha
 */
export function generateSchemaFromSimpleSchema(simple: SimpleTreeSchema): FieldSchemaAlpha {
	const context: Context = new Map(
		[...simple.definitions].map(([id, schema]): [string, () => TreeNodeSchema] => [
			id,
			// This relies on the caching in evaluateLazySchema so that it only runs once.
			() => generateNode(id, schema, context),
		]),
	);
	return generateFieldSchema(simple, context);
}

type Context = ReadonlyMap<string, () => TreeNodeSchema>;

function generateFieldSchema(simple: SimpleFieldSchema, context: Context): FieldSchemaAlpha {
	const allowed = generateAllowedTypes(simple.allowedTypesIdentifiers, context);
	// Using createFieldSchema could work, but would require setting up the default providers.
	switch (simple.kind) {
		case FieldKind.Identifier:
			return SchemaFactoryAlpha.identifier({ metadata: simple.metadata });
		case FieldKind.Optional:
			return SchemaFactoryAlpha.optional(allowed, { metadata: simple.metadata });
		case FieldKind.Required:
			return SchemaFactoryAlpha.required(allowed, { metadata: simple.metadata });
		default:
			return unreachableCase(simple.kind);
	}
}

function generateAllowedTypes(allowed: ReadonlySet<string>, context: Context): AllowedTypes {
	return [...allowed].map((id) => context.get(id) ?? fail(0xb5a /* Missing schema */));
}

function generateNode(id: string, schema: SimpleNodeSchema, context: Context): TreeNodeSchema {
	switch (schema.kind) {
		case NodeKind.Object: {
			const fields: Record<string, FieldSchema> = {};
			for (const [key, field] of schema.fields) {
				fields[key] = generateFieldSchema(field, context);
			}
			return factory.object(id, fields, { metadata: schema.metadata });
		}
		case NodeKind.Array:
			return factory.arrayAlpha(
				id,
				generateAllowedTypes(schema.allowedTypesIdentifiers, context),
				{ metadata: schema.metadata },
			);
		case NodeKind.Map:
			return factory.mapAlpha(
				id,
				generateAllowedTypes(schema.allowedTypesIdentifiers, context),
				{ metadata: schema.metadata },
			);
		case NodeKind.Leaf:
			return (
				SchemaFactory.leaves.find((leaf) => leaf.identifier === id) ??
				fail(0xb5b /* Missing schema */)
			);
		default:
			return unreachableCase(schema);
	}
}
