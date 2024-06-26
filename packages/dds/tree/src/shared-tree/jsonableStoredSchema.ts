/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	EmptyKey,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	ValueSchema,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
} from "../core/index.js";
import { fail } from "../util/index.js";

/**
 * TODO
 * @internal
 */
export type JsonableNodeKind = "object" | "array" | "map" | "leaf";

/**
 * TODO
 * @internal
 */
export type JsonableFieldKind = "optional" | "required" | "identifier";

/**
 * TODO
 * @internal
 */
export type JsonableLeafKind = "string" | "number" | "boolean" | "null";

/**
 * TODO
 * @internal
 */
export interface JsonableStoredNodeSchemaBase<TNodeKind extends JsonableNodeKind> {
	readonly kind: TNodeKind;
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredObjectNodeSchema
	extends JsonableStoredNodeSchemaBase<"object"> {
	readonly fields: Record<string, JsonableStoredFieldSchema>;
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredArrayNodeSchema extends JsonableStoredNodeSchemaBase<"array"> {
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredMapNodeSchema extends JsonableStoredNodeSchemaBase<"map"> {
	readonly allowedTypes: ReadonlySet<string>;
}

/**
 * TODO
 * @internal
 */
export interface JsonableStoredLeafNodeSchema extends JsonableStoredNodeSchemaBase<"leaf"> {
	readonly type: JsonableLeafKind;
}

/**
 * TODO
 * @internal
 */
export type JsonableStoredNodeSchema =
	| JsonableStoredLeafNodeSchema
	| JsonableStoredMapNodeSchema
	| JsonableStoredArrayNodeSchema
	| JsonableStoredObjectNodeSchema;

/**
 * TODO
 * @internal
 */
export interface JsonableStoredFieldSchema {
	readonly kind: JsonableFieldKind;
	readonly allowedTypes: readonly string[];
}

/**
 * TODO
 * @internal
 */
export interface JsonableTreeSchema {
	readonly rootFieldSchema: JsonableStoredFieldSchema;
	readonly definitions: ReadonlyMap<string, JsonableStoredNodeSchema>;
}

export function toJsonableTreeSchema(
	schemaMap: ReadonlyMap<string, TreeNodeStoredSchema>,
	rootFieldSchema: TreeFieldStoredSchema,
): JsonableTreeSchema {
	const definitions = new Map<string, JsonableStoredNodeSchema>();
	for (const [type, schema] of schemaMap) {
		definitions.set(type, toJsonableNodeSchema(schema));
	}
	return {
		rootFieldSchema: toJsonableFieldSchema(rootFieldSchema),
		definitions,
	};
}

function toJsonableFieldSchema(fieldSchema: TreeFieldStoredSchema): JsonableStoredFieldSchema {
	const allowedTypes: string[] = [];
	for (const type of fieldSchema.types ?? []) {
		allowedTypes.push(type);
	}
	return {
		kind: "optional", // TODO: actually get this from the schema
		allowedTypes,
	};
}

function toJsonableNodeSchema(schema: TreeNodeStoredSchema): JsonableStoredNodeSchema {
	if (schema instanceof ObjectNodeStoredSchema) {
		return toJsonableObjectNodeSchema(schema);
	} else if (schema instanceof MapNodeStoredSchema) {
		return toJsonableMapNodeSchema(schema);
	} else if (schema instanceof LeafNodeStoredSchema) {
		return toJsonableLeafNodeSchema(schema);
	} else {
		fail("Encountered an unknown node schema type.");
	}
}

function toJsonableObjectNodeSchema(
	schema: ObjectNodeStoredSchema,
): JsonableStoredObjectNodeSchema | JsonableStoredArrayNodeSchema {
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
		} satisfies JsonableStoredArrayNodeSchema;
	} else {
		// Object case
		const fields: Record<string, JsonableStoredFieldSchema> = {};
		for (const [fieldKey, fieldSchema] of schema.objectNodeFields) {
			fields[fieldKey] = toJsonableFieldSchema(fieldSchema);
		}
		return {
			kind: "object",
			fields,
		} satisfies JsonableStoredObjectNodeSchema;
	}
}

function toJsonableMapNodeSchema(schema: MapNodeStoredSchema): JsonableStoredMapNodeSchema {
	const allowedTypes = new Set<string>();
	for (const type of schema.mapFields.types ?? []) {
		allowedTypes.add(type);
	}
	return {
		kind: "map",
		allowedTypes,
	};
}

function toJsonableLeafNodeSchema(schema: LeafNodeStoredSchema): JsonableStoredLeafNodeSchema {
	function leafKindFromValueSchema(valueSchema: ValueSchema): JsonableLeafKind {
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
