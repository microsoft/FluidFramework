/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	Multiplicity,
	ObjectNodeStoredSchema,
	ValueSchema,
	type SchemaPolicy,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
} from "../core/index.js";
import { fail } from "../util/index.js";
import type {
	SimpleArrayNodeSchema,
	SimpleFieldSchema,
	SimpleLeafNodeSchema,
	SimpleLeafSchemaKind,
	SimpleMapNodeSchema,
	SimpleNodeSchema,
	SimpleObjectNodeSchema,
	SimpleTreeSchema,
} from "../simple-tree/index.js";

export function toSimpleTreeSchema(
	schemaMap: ReadonlyMap<string, TreeNodeStoredSchema>,
	rootFieldSchema: TreeFieldStoredSchema,
	schemaPolicy: SchemaPolicy,
): SimpleTreeSchema {
	const definitions = new Map<string, SimpleNodeSchema>();
	for (const [type, schema] of schemaMap) {
		definitions.set(type, toSimpleNodeSchema(schema, schemaPolicy));
	}

	const transformedRootFieldSchema = toSimpleFieldSchema(rootFieldSchema, schemaPolicy);

	// TODO: verify this.
	assert(transformedRootFieldSchema.kind === "required", "Root field must be required.");

	return {
		allowedTypes: transformedRootFieldSchema.allowedTypes,
		definitions,
	};
}

function toSimpleFieldSchema(
	fieldSchema: TreeFieldStoredSchema,
	schemaPolicy: SchemaPolicy,
): SimpleFieldSchema {
	const allowedTypes = new Set<string>();
	for (const type of fieldSchema.types ?? []) {
		allowedTypes.add(type);
	}

	const fieldKindData = schemaPolicy.fieldKinds.get(fieldSchema.kind);
	assert(fieldKindData !== undefined, "Encountered field without kind policy.");

	assert(
		fieldKindData.multiplicity === Multiplicity.Optional ||
			fieldKindData.multiplicity === Multiplicity.Single,
		"Encountered object field with unexpected multiplicity.",
	);

	return {
		kind: fieldKindData.multiplicity === Multiplicity.Optional ? "optional" : "required",
		allowedTypes,
	};
}

function toSimpleNodeSchema(
	schema: TreeNodeStoredSchema,
	schemaPolicy: SchemaPolicy,
): SimpleNodeSchema {
	if (schema instanceof ObjectNodeStoredSchema) {
		return toSimpleObjectNodeSchema(schema, schemaPolicy);
	} else if (schema instanceof MapNodeStoredSchema) {
		return toSimpleMapNodeSchema(schema);
	} else if (schema instanceof LeafNodeStoredSchema) {
		return toSimpleLeafNodeSchema(schema);
	} else {
		fail("Encountered an unknown node schema type.");
	}
}

function toSimpleObjectNodeSchema(
	schema: ObjectNodeStoredSchema,
	schemaPolicy: SchemaPolicy,
): SimpleObjectNodeSchema | SimpleArrayNodeSchema {
	if (schema.objectNodeFields.size === 1 && schema.objectNodeFields.has(EmptyKey)) {
		// Array case
		const allowedTypes = new Set<string>();
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		for (const type of schema.objectNodeFields.get(EmptyKey)!.types ?? []) {
			allowedTypes.add(type);
		}
		return {
			kind: "array",
			allowedTypes,
		} satisfies SimpleArrayNodeSchema;
	} else {
		// Object case
		const fields: Record<string, SimpleFieldSchema> = {};
		for (const [fieldKey, fieldSchema] of schema.objectNodeFields) {
			fields[fieldKey] = toSimpleFieldSchema(fieldSchema, schemaPolicy);
		}
		return {
			kind: "object",
			fields,
		} satisfies SimpleObjectNodeSchema;
	}
}

function toSimpleMapNodeSchema(schema: MapNodeStoredSchema): SimpleMapNodeSchema {
	const allowedTypes = new Set<string>();
	for (const type of schema.mapFields.types ?? []) {
		allowedTypes.add(type);
	}
	return {
		kind: "map",
		allowedTypes,
	};
}

function toSimpleLeafNodeSchema(schema: LeafNodeStoredSchema): SimpleLeafNodeSchema {
	function leafKindFromValueSchema(valueSchema: ValueSchema): SimpleLeafSchemaKind {
		switch (valueSchema) {
			case ValueSchema.Number:
				return "number";
			case ValueSchema.String:
				return "string";
			case ValueSchema.Boolean:
				return "boolean";
			case ValueSchema.Null:
				return "null";
			default:
				fail("Encountered an unknown leaf value schema type.");
		}
	}

	return {
		kind: "leaf",
		type: leafKindFromValueSchema(schema.leafValue),
	};
}
