/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { fail } from "../../util/index.js";
import { NodeKind, type TreeNodeSchema } from "../core/index.js";
import { createFieldSchema, type FieldSchema, type AllowedTypes } from "../schemaTypes.js";
import { SchemaFactory } from "./schemaFactory.js";
import type { SimpleFieldSchema, SimpleNodeSchema, SimpleTreeSchema } from "./simpleSchema.js";

const factory = new SchemaFactory(undefined);

/**
 * Create {@link FieldSchema} from a SimpleTreeSchema.
 * @remarks
 * Only use this API if hand written schema (produced using {@link SchemaFactory} cannot be provided.
 *
 * Using generated schema with schema aware APIs (designed to work with strongly typed schema) like {@link TreeViewConfiguration}
 * will produce a poor TypeScript typing experience which is subject to change.
 *
 * Editing through a view produced using this schema can easily violate invariants other users of the document might expect and must be done with great care.
 * @internal
 */
export function generateSchemaFromSimpleSchema(simple: SimpleTreeSchema): FieldSchema {
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

function generateFieldSchema(simple: SimpleFieldSchema, context: Context): FieldSchema {
	return createFieldSchema(simple.kind, generateAllowedTypes(simple.allowedTypes, context));
}

function generateAllowedTypes(allowed: ReadonlySet<string>, context: Context): AllowedTypes {
	return [...allowed].map((id) => context.get(id) ?? fail(`Missing schema`));
}

function generateNode(id: string, schema: SimpleNodeSchema, context: Context): TreeNodeSchema {
	switch (schema.kind) {
		case NodeKind.Object: {
			const fields: Record<string, FieldSchema> = {};
			for (const [key, field] of Object.entries(schema.fields)) {
				fields[key] = generateFieldSchema(field, context);
			}
			return factory.object(id, fields);
		}
		case NodeKind.Array:
			return factory.array(id, generateAllowedTypes(schema.allowedTypes, context));
		case NodeKind.Map:
			return factory.map(id, generateAllowedTypes(schema.allowedTypes, context));
		case NodeKind.Leaf:
			return (
				SchemaFactory.leaves.find((leaf) => leaf.identifier === id) ?? fail(`Missing schema`)
			);
		default:
			return unreachableCase(schema);
	}
}
