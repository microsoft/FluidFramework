/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase, fail } from "@fluidframework/core-utils/internal";

import { NodeKind, type TreeNodeSchema, type AllowedTypesFull } from "../core/index.js";
import {
	type FieldSchema,
	type FieldSchemaAlpha,
	FieldKind,
	type FieldProps,
} from "../fieldSchema.js";
import type {
	SimpleAllowedTypeAttributes,
	SimpleFieldSchema,
	SimpleNodeSchema,
	SimpleTreeSchema,
} from "../simpleSchema.js";

import type { TreeSchema } from "./configuration.js";
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
 *
 * This API bakes in some arbitrary policy choices for how to handle data that is not included in the SimpleTreeSchema API, for example the value of `allowUnknownOptionalFields`.
 * If any particular choice is required for such cases, this API should not be used.
 * @alpha
 */
export function generateSchemaFromSimpleSchema(simple: SimpleTreeSchema): TreeSchema {
	const context: Context = new Map(
		[...simple.definitions].map(
			([id, schema]): [string, () => TreeNodeSchema & SimpleNodeSchema] => [
				id,
				// This relies on the caching in evaluateLazySchema so that it only runs once.
				() => generateNode(id, schema, context),
			],
		),
	);
	const root = generateFieldSchema(simple.root, context, undefined);
	const definitions = new Map<string, TreeNodeSchema & SimpleNodeSchema>();
	for (const [id, lazy] of context) {
		definitions.set(id, lazy());
	}
	return {
		root,
		definitions,
	};
}

type Context = ReadonlyMap<string, () => TreeNodeSchema & SimpleNodeSchema>;

function generateFieldSchema(
	simple: SimpleFieldSchema,
	context: Context,
	storedKey: string | undefined,
): FieldSchemaAlpha {
	const allowed = generateAllowedTypes(simple.simpleAllowedTypes, context);
	const props: Omit<FieldProps, "defaultProvider"> = {
		metadata: simple.metadata,
		key: storedKey,
	};

	// Using createFieldSchema could work, but would require setting up the default providers.
	switch (simple.kind) {
		case FieldKind.Identifier:
			return SchemaFactoryAlpha.identifier(props);
		case FieldKind.Optional:
			return SchemaFactoryAlpha.optional(allowed, props);
		case FieldKind.Required:
			return SchemaFactoryAlpha.required(allowed, props);
		default:
			return unreachableCase(simple.kind);
	}
}

function generateAllowedTypes(
	allowed: ReadonlyMap<string, SimpleAllowedTypeAttributes>,
	context: Context,
): AllowedTypesFull {
	const types = Array.from(allowed.entries(), ([id, attributes]) => {
		const schema = context.get(id) ?? fail(0xb5a /* Missing schema */);
		return (attributes.isStaged ?? false) ? factory.staged(schema) : schema;
	});
	// TODO: AB#53315: `AllowedTypesFullFromMixed` does not correctly handle the `(AnnotatedAllowedType | LazyItem<TreeNodeSchema>)[]` case.
	// We have to cast here in order to produce an allowed types list that can be used in tree node factory methods (e.g., `SchemaFactoryAlpha.objectAlpha`).
	return SchemaFactoryAlpha.types(types) as AllowedTypesFull;
}

function generateNode(
	id: string,
	schema: SimpleNodeSchema,
	context: Context,
): TreeNodeSchema & SimpleNodeSchema {
	switch (schema.kind) {
		case NodeKind.Object: {
			const fields: Record<string, FieldSchema> = {};
			for (const [key, field] of schema.fields) {
				fields[key] = generateFieldSchema(field, context, field.storedKey);
			}
			// Here allowUnknownOptionalFields is implicitly defaulting in the case where the input schema does not explicitly specify the value.
			// This is a subjective policy choice: users of this code are expected to handle what ever choice this code makes for cases like this.
			return factory.objectAlpha(id, fields, {
				metadata: schema.metadata,
				allowUnknownOptionalFields: schema.allowUnknownOptionalFields ?? false,
			});
		}
		case NodeKind.Array:
			return factory.arrayAlpha(id, generateAllowedTypes(schema.simpleAllowedTypes, context), {
				metadata: schema.metadata,
			});
		case NodeKind.Map:
			return factory.mapAlpha(id, generateAllowedTypes(schema.simpleAllowedTypes, context), {
				metadata: schema.metadata,
			});
		case NodeKind.Record:
			return factory.recordAlpha(
				id,
				generateAllowedTypes(schema.simpleAllowedTypes, context),
				{ metadata: schema.metadata },
			);
		case NodeKind.Leaf:
			return (
				SchemaFactoryAlpha.leaves.find((leaf) => leaf.identifier === id) ??
				fail(0xb5b /* Missing schema */)
			);
		default:
			return unreachableCase(schema);
	}
}
