/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { UsageError } from "@fluidframework/telemetry-utils";

import {
	type FieldKey,
	type MapTree,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeTypeSet,
} from "../core";
// Drilling into `domains` to reduce the magnitude of cycles introduced here
// eslint-disable-next-line import/no-internal-modules
import { leaf } from "../domains/leafDomain";
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
	type TreeNodeSchema,
} from "../feature-libraries";
import { brand, fail } from "../util";
import { InsertableTreeField, InsertableTypedNode } from "./insertable";

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
 * @returns A cursor (in nodes mode) for the mapped tree if the input data was defined. Otherwise, returns `undefined`.
 */
export function cursorFromNodeData(
	data: InsertableTypedNode<TreeNodeSchema>,
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
	data: InsertableTreeField,
	context: TreeDataContext,
	fieldSchema: TreeFieldStoredSchema,
): CursorWithNode<MapTree> {
	const mappedContent = fieldDataToMapTrees(data, context, fieldSchema);
	return cursorForMapTreeField(mappedContent);
}

/**
 * Transforms an input {@link TypedNode} tree to a {@link MapTree}.
 * @param data - The input tree to be converted.
 * If the data is an unsupported value (e.g. NaN), a fallback value will be used when supported,
 * otherwise an error will be thrown.
 *
 * Fallbacks:
 *
 * * `NaN` =\> `null`
 *
 * * `+/-∞` =\> `null`
 *
 * * `-0` =\> `+0`
 *
 * @param context - Describes the context into which the data is being created. See {@link FlexTreeEntity.context}.
 * @param typeSet - The set of types allowed by the parent context. Used to validate the input tree.
 */
export function nodeDataToMapTree(
	data: InsertableTypedNode<TreeNodeSchema>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	assert(data !== undefined, 0x846 /* Cannot map undefined tree. */);

	if (data === null) {
		return valueToMapTree(data, context, typeSet);
	}
	switch (typeof data) {
		case "number":
		case "string":
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
					data as Record<string, InsertableTypedNode<TreeNodeSchema>>,
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
 * If the input is a sequence containing 1 or more `undefined` values, those values will be mapped as `null` if supported.
 * Othewise, an error will be thrown.
 * @param context - Describes the context into which the data is being created. See {@link FlexTreeEntity.context}.
 */
export function fieldDataToMapTrees(
	data: InsertableTreeField,
	context: TreeDataContext,
	fieldSchema: TreeFieldStoredSchema,
): MapTree[] {
	const multiplicity = getFieldKind(fieldSchema).multiplicity;
	if (data === undefined) {
		assert(
			multiplicity === Multiplicity.Forbidden || multiplicity === Multiplicity.Optional,
			0x847 /* `undefined` provided for a field that does not support `undefined` */,
		);
		return [];
	}

	const typeSet = fieldSchema.types;

	if (multiplicity === Multiplicity.Sequence) {
		assert(Array.isArray(data), 0x848 /* Expected an array as sequence input. */);
		const children = Array.from(data, (child) => {
			// We do not support undefined sequence entries.
			// If we encounter an undefined entry, use null instead if supported by the schema, otherwise throw.
			let childWithFallback = child;
			if (child === undefined) {
				if (typeSet?.has(leaf.null.name) ?? false) {
					childWithFallback = null;
				} else {
					throw new TypeError(`Received unsupported list entry value: ${child}.`);
				}
			}
			return nodeDataToMapTree(childWithFallback, context, typeSet);
		});
		return children;
	}
	assert(
		multiplicity === Multiplicity.Single || multiplicity === Multiplicity.Optional,
		0x849 /* A single value was provided for an unsupported field */,
	);
	return [nodeDataToMapTree(data, context, typeSet)];
}

function valueToMapTree(
	// eslint-disable-next-line @rushstack/no-new-null
	value: boolean | number | string | IFluidHandle | null,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const mappedValue = mapValueWithFallbacks(value, typeSet);

	const type = getType(mappedValue, context, typeSet);
	const schema = getSchema(context, type);
	assert(
		allowsValue(schema.leafValue, mappedValue),
		0x84a /* Unsupported schema for provided primitive. */,
	);

	return {
		value: mappedValue,
		type,
		fields: new Map(),
	};
}

/**
 * Checks an incoming value to ensure it is compatible with our serialization format.
 * For unsupported values with a schema-compatible replacement, return the replacement value.
 * For unsupported values without a schema-compatible replacement, throw.
 * For supported values, return the input.
 */
function mapValueWithFallbacks(
	// eslint-disable-next-line @rushstack/no-new-null
	value: boolean | number | string | IFluidHandle | null,
	typeSet: TreeTypeSet,
	// eslint-disable-next-line @rushstack/no-new-null
): boolean | number | string | IFluidHandle | null {
	switch (typeof value) {
		case "number": {
			if (Object.is(value, -0)) {
				// Our serialized data format does not support -0.
				// Map such input to +0.
				return 0;
			} else if (Number.isNaN(value) || !Number.isFinite(value)) {
				// Our serialized data format does not support NaN nor +/-∞.
				// If the schema supports `null`, fall back to that. Otherwise, throw.
				// This is intended to match JSON's behavior for such values.
				if (typeSet?.has(leaf.null.name) ?? false) {
					return null;
				} else {
					throw new TypeError(`Received unsupported numeric value: ${value}.`);
				}
			} else {
				return value;
			}
		}
		default:
			return value;
	}
}

function arrayToMapTree(
	data: InsertableTypedNode<TreeNodeSchema>[],
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(data, context, typeSet);
	const schema = getSchema(context, type);
	const primaryField = getPrimaryField(schema);
	assert(
		primaryField !== undefined,
		0x84b /* Array data reported comparable with the schema without a primary field. */,
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
	data: Map<string, InsertableTypedNode<TreeNodeSchema>>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(data, context, typeSet);
	const schema = getSchema(context, type);

	const fields = new Map<FieldKey, MapTree[]>();
	for (const [key, value] of data) {
		assert(!fields.has(brand(key)), 0x84c /* Keys should not be duplicated */);

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
	data: Record<string | number | symbol, InsertableTypedNode<TreeNodeSchema>>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(data, context, typeSet);
	const schema = getSchema(context, type);

	const fields = new Map<FieldKey, MapTree[]>();

	// Filter keys to only those that are strings - our trees do not support symbol or numeric property keys
	const keys = Reflect.ownKeys(data).filter((key) => typeof key === "string") as FieldKey[];

	for (const key of keys) {
		assert(!fields.has(key), 0x84d /* Keys should not be duplicated */);
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
	data: InsertableTypedNode<TreeNodeSchema>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): TreeNodeSchemaIdentifier {
	const possibleTypes = getPossibleTypes(context, typeSet, data as ContextuallyTypedNodeData);
	assert(
		possibleTypes.length !== 0,
		0x84e /* data is incompatible with all types allowed by the schema */,
	);
	checkInput(
		possibleTypes.length === 1,
		() =>
			`The provided data is compatible with more than one type allowed by the schema.
The set of possible types is ${JSON.stringify([...possibleTypes], undefined)}.
Explicitly construct an unhydrated node of the desired type to disambiguate.
For class-based schema, this can be done by replacing an expression like "{foo: 1}" with "new MySchema({foo: 1})".`,
	);
	return possibleTypes[0];
}

function getSchema(context: TreeDataContext, type: TreeNodeSchemaIdentifier): TreeNodeStoredSchema {
	return context.schema.nodeSchema.get(type) ?? fail("Requested type does not exist in schema.");
}

/**
 * An invalid tree has been provided, presumably by the user of this package.
 * Throw and an error that properly preserves the message (unlike asserts which will get hard to read short codes intended for package internal logic errors).
 */
function invalidInput(message: string): never {
	throw new UsageError(message);
}

function checkInput(condition: boolean, message: string | (() => string)): asserts condition {
	if (!condition) {
		invalidInput(typeof message === "string" ? message : message());
	}
}
