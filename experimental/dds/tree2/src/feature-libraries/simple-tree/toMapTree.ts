/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";

import {
	TreeTypeSet,
	type FieldKey,
	type MapTree,
	type TreeNodeSchemaIdentifier,
	type TreeFieldStoredSchema,
	TreeNodeStoredSchema,
} from "../../core";
import { brand, fail } from "../../util";
import {
	ContextuallyTypedNodeData,
	PrimitiveValue,
	TreeDataContext,
	allowsValue,
	getFieldKind,
	getFieldSchema,
	getPossibleTypes,
	getPrimaryField,
	isFluidHandle,
} from "../contextuallyTyped";
import { Multiplicity } from "../modular-schema";
import { TreeFieldSchema, type TreeNodeSchema } from "../typed-schema";
import { TypedNode, TreeField } from "./types";

/**
 * Transforms an input {@link TypedNode} tree to a {@link MapTree}.
 * @param data - TODO (note POJO nature)
 */
export function toMapTree(
	data: TypedNode<TreeNodeSchema, "javaScript">,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	assert(data !== undefined, "Cannot map undefined tree.");

	if (data === null) {
		return valueToMapTree(data, context, typeSet);
	}
	switch (typeof data) {
		case "number":
			return valueToMapTree(data, context, typeSet);
		case "string":
			return valueToMapTree(data, context, typeSet);
		case "boolean":
			return valueToMapTree(data, context, typeSet);
		default: {
			if (isFluidHandle(data)) {
				return valueToMapTree(data, context, typeSet);
			} else if (Array.isArray(data)) {
				return arrayToMapTree(data, context, typeSet);
			} else if (data instanceof Map) {
				return mapToMapTree(data, context, typeSet);
			} else {
				// Assume record-like object
				return recordToMapTree(
					data as Record<string, TypedNode<TreeNodeSchema, "javaScript">>,
					context,
					typeSet,
				);
			}
		}
	}
}

/**
 * Transforms an input {@link TreeField} tree to a list of {@link MapTree}s.
 * @param data - TODO (note POJO nature)
 */
export function fieldDataToMapTrees(
	data: TreeField<TreeFieldSchema, "javaScript">,
	context: TreeDataContext,
	fieldSchema: TreeFieldStoredSchema,
): MapTree[] {
	const multiplicity = getFieldKind(fieldSchema).multiplicity;
	if (data === undefined) {
		assert(
			multiplicity === Multiplicity.Forbidden || multiplicity === Multiplicity.Optional,
			"`undefined` provided for a field that does not support `undefined`",
		);
		return [];
	}
	if (multiplicity === Multiplicity.Sequence) {
		assert(Array.isArray(data), "Expected an array as sequence input.");
		const children = Array.from(data, (child) => toMapTree(child, context, fieldSchema.types));
		return children;
	}
	assert(
		multiplicity === Multiplicity.Single || multiplicity === Multiplicity.Optional,
		"A single value was provided for an unsupported field",
	);
	return [toMapTree(data, context, fieldSchema.types)];
}

function valueToMapTree(
	// eslint-disable-next-line @rushstack/no-new-null
	value: PrimitiveValue | IFluidHandle | null,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(value, context, typeSet);
	const schema = getSchema(context, type);
	assert(allowsValue(schema.leafValue, value), "Unsupported schema for provided primitive.");

	return {
		value,
		type,
		fields: new Map(),
	};
}

function arrayToMapTree(
	data: TypedNode<TreeNodeSchema, "javaScript">[],
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(data, context, typeSet);
	const schema = getSchema(context, type);
	const primaryField = getPrimaryField(schema);
	assert(
		primaryField !== undefined,
		"Array data reported comparable with the schema without a primary field.",
	);

	const mappedChildren = fieldDataToMapTrees(data, context, primaryField.schema);
	const fieldsEntries: [FieldKey, MapTree[]][] =
		mappedChildren.length === 0 ? [] : [[primaryField.key, mappedChildren]];

	// List children are represented as a single field entry denoted with `EmptyKey`
	const fields = new Map<FieldKey, MapTree[]>(fieldsEntries);

	return {
		type,
		fields,
	};
}

function mapToMapTree(
	tree: Map<string, TypedNode<TreeNodeSchema, "javaScript">>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(tree, context, typeSet);
	const schema = getSchema(context, type);

	const fields = new Map<FieldKey, MapTree[]>();
	for (const [key, value] of tree) {
		assert(!fields.has(brand(key)), "Keys should not be duplicated");
		if (value !== undefined) {
			const childSchema = getFieldSchema(brand(key), schema);
			const mappedField = fieldDataToMapTrees(value, context, childSchema);
			fields.set(brand(key), mappedField);
		}
	}
	return {
		type,
		fields,
	};
}

function recordToMapTree(
	tree: Record<string | number | symbol, TypedNode<TreeNodeSchema, "javaScript">>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(tree, context, typeSet);
	const schema = getSchema(context, type);

	const fields = new Map<FieldKey, MapTree[]>();

	// Filter keys to only those that are strings - our trees do not support symbol or numeric property keys
	const keys = Reflect.ownKeys(tree).filter((key) => typeof key === "string") as FieldKey[];
	for (const key of keys) {
		assert(!fields.has(key), "Keys should not be duplicated");
		const value = tree[key];
		if (value !== undefined) {
			const childSchema = getFieldSchema(brand(key), schema);
			const mappedChildTree = fieldDataToMapTrees(value, context, childSchema);
			fields.set(brand(key), mappedChildTree);
		}
	}

	return {
		type,
		fields,
	};
}

function getType(
	tree: TypedNode<TreeNodeSchema, "javaScript">,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): TreeNodeSchemaIdentifier {
	const possibleTypes = getPossibleTypes(context, typeSet, tree as ContextuallyTypedNodeData);
	assert(possibleTypes.length !== 0, "data is incompatible with all types allowed by the schema");
	assert(
		possibleTypes.length === 1,
		"data is compatible with more than one type allowed by the schema",
	);
	return possibleTypes[0];
}

function getSchema(context: TreeDataContext, type: TreeNodeSchemaIdentifier): TreeNodeStoredSchema {
	const schema = context.schema.nodeSchema.get(type);
	if (schema === undefined) {
		fail("Requested type does not exist in schema.");
	}
	return schema;
}
