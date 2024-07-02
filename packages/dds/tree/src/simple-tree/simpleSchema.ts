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

// TODOs:
// - Handle "Any"

// JSON Schema
// - Map policy
// - FluidHandle policy
// - How to represent types (for type disambiguation)
//    - Allow only annotating types when required for disambiguation.
//    - Root (type) is maybe special

// Future:
// - For API where you can get this for a view schema, configuration options for which field names to use (stored or view) and plan for future config options.

/**
 * @internal
 */
export type SimpleNodeSchemaKind = "object" | "array" | "map" | "leaf";

/**
 * @internal
 */
export type SimpleFieldSchemaKind = "optional" | "required";

/**
 * @internal
 */
export type SimpleLeafSchemaKind = "string" | "number" | "boolean" | "null";

/**
 * @internal
 */
export interface SimpleNodeSchemaBase<TNodeKind extends SimpleNodeSchemaKind> {
	readonly kind: TNodeKind;
}

/**
 * @internal
 */
export interface SimpleObjectNodeSchema extends SimpleNodeSchemaBase<"object"> {
	readonly fields: Record<string, SimpleFieldSchema>;
}

/**
 * @internal
 */
export interface SimpleArrayNodeSchema extends SimpleNodeSchemaBase<"array"> {
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * @internal
 */
export interface SimpleMapNodeSchema extends SimpleNodeSchemaBase<"map"> {
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * @internal
 */
export interface SimpleLeafNodeSchema extends SimpleNodeSchemaBase<"leaf"> {
	readonly type: SimpleLeafSchemaKind;
}

/**
 * @internal
 */
export type SimpleNodeSchema =
	| SimpleLeafNodeSchema
	| SimpleMapNodeSchema
	| SimpleArrayNodeSchema
	| SimpleObjectNodeSchema;

/**
 * TODO
 * @internal
 */
export interface SimpleFieldSchema {
	readonly kind: SimpleFieldSchemaKind;
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * TODO
 * @privateRemarks Currently assumes root field is required. TODO: verify this is true in simple tree world.
 * @internal
 */
export interface SimpleTreeSchema {
	readonly definitions: ReadonlyMap<string, SimpleNodeSchema>;
	readonly allowedTypes: ReadonlySet<string>;
}

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
