/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";

import {
	type FieldKey,
	type MapTree,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeTypeSet,
} from "../core";
import { brand, fail } from "../util";
import {
	allowsValue,
	type ContextuallyTypedNodeData,
	cursorForMapTreeField,
	cursorForMapTreeNode,
	type CursorWithNode,
	getFieldKind,
	getFieldSchema,
	getPossibleTypes,
	getPrimaryField,
	isFluidHandle,
	Multiplicity,
	type TreeDataContext,
	type TreeFieldSchema,
	type TreeNodeSchema,
} from "../feature-libraries";
import { type TreeField, type TypedNode } from "./types";

/**
 * Module notes:
 *
 * The flow of the below code is in terms of the structure of the input data. We then verify that the associated
 * schema is appropriate for that kind of data. This is fine while we have a 1:1 mapping of kind of input data to
 * the kind of schema we expect for it (e.g. an input that is an array always need to be associated with a sequence in
 * the schema). If/when we begin accepting kinds of input data that are ambiguous (e.g. accepting an input that is an
 * array of key/value tuples to instantiate a map) we may need to rethink the structure here to be based more on the
 * schema than on the input data.
 */

/**
 * Transforms an input {@link TypedNode} tree to a {@link MapTree}, and wraps the tree in a {@link CursorWithNode}.
 * @param data - The input tree to be converted.
 * @param context - Describes the context into which the data is being created. See {@link FlexTreeEntity.context}.
 * @param typeSet - The set of types allowed by the parent context. Used to validate the input tree.
 *
 * @returns A cursor for the mapped tree if the input data was defined. Otherwise, returns `undefined`.
 */
export function cursorFromNodeData(
	data: TypedNode<TreeNodeSchema, "javaScript">,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): CursorWithNode<MapTree> | undefined {
	if (data === undefined) {
		return undefined;
	}
	const mappedContent = nodeDataToMapTree(data, context, typeSet);
	return cursorForMapTreeNode(mappedContent);
}

/**
 * Transforms an input {@link TreeField} tree to a list of {@link MapTree}s, and wraps the tree in a {@link CursorWithNode}.
 * @param data - The input tree to be converted.
 * @param context - Describes the context into which the data is being created. See {@link FlexTreeEntity.context}.
 */
export function cursorFromFieldData(
	data: TreeField<TreeFieldSchema, "javaScript">,
	context: TreeDataContext,
	fieldSchema: TreeFieldStoredSchema,
): CursorWithNode<MapTree> {
	const mappedContent = fieldDataToMapTrees(data, context, fieldSchema);
	return cursorForMapTreeField(mappedContent);
}

/**
 * Transforms an input {@link TypedNode} tree to a {@link MapTree}.
 * @param data - The input tree to be converted.
 * @param context - Describes the context into which the data is being created. See {@link FlexTreeEntity.context}.
 * @param typeSet - The set of types allowed by the parent context. Used to validate the input tree.
 */
export function nodeDataToMapTree(
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
 * @param data - The input tree to be converted.
 * @param context - Describes the context into which the data is being created. See {@link FlexTreeEntity.context}.
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
		const children = Array.from(data, (child) =>
			nodeDataToMapTree(child, context, fieldSchema.types),
		);
		return children;
	}
	assert(
		multiplicity === Multiplicity.Single || multiplicity === Multiplicity.Optional,
		"A single value was provided for an unsupported field",
	);
	return [nodeDataToMapTree(data, context, fieldSchema.types)];
}

function valueToMapTree(
	// eslint-disable-next-line @rushstack/no-new-null
	value: boolean | number | string | IFluidHandle | null,
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
	data: Map<string, TypedNode<TreeNodeSchema, "javaScript">>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(data, context, typeSet);
	const schema = getSchema(context, type);

	const fields = new Map<FieldKey, MapTree[]>();
	for (const [key, value] of data) {
		assert(!fields.has(brand(key)), "Keys should not be duplicated");

		// Omit undefined record entries - an entry with an undefined key is equivalent to no entry
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
	data: Record<string | number | symbol, TypedNode<TreeNodeSchema, "javaScript">>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(data, context, typeSet);
	const schema = getSchema(context, type);

	const fields = new Map<FieldKey, MapTree[]>();

	// Filter keys to only those that are strings - our trees do not support symbol or numeric property keys
	const keys = Reflect.ownKeys(data).filter((key) => typeof key === "string") as FieldKey[];

	for (const key of keys) {
		assert(!fields.has(key), "Keys should not be duplicated");
		const value = data[key];

		// Omit undefined record entries - an entry with an undefined key is equivalent to no entry
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
	data: TypedNode<TreeNodeSchema, "javaScript">,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): TreeNodeSchemaIdentifier {
	const possibleTypes = getPossibleTypes(context, typeSet, data as ContextuallyTypedNodeData);
	assert(possibleTypes.length !== 0, "data is incompatible with all types allowed by the schema");
	assert(
		possibleTypes.length === 1,
		"data is compatible with more than one type allowed by the schema",
	);
	return possibleTypes[0];
}

function getSchema(context: TreeDataContext, type: TreeNodeSchemaIdentifier): TreeNodeStoredSchema {
	return context.schema.nodeSchema.get(type) ?? fail("Requested type does not exist in schema.");
}
