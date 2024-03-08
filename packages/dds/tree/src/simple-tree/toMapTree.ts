/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { UsageError } from "@fluidframework/telemetry-utils";

import { EmptyKey, type FieldKey, type MapTree, type TreeValue } from "../core/index.js";
import {
	allowsValue as flexSchemaAllowsValue,
	cursorForMapTreeField,
	cursorForMapTreeNode,
	type CursorWithNode,
	isFluidHandle,
	typeNameSymbol,
	isTreeValue,
	schemaIsLeaf,
	type LazyItem,
	isLazy,
} from "../feature-libraries/index.js";
import { brand, fail, isReadonlyArray } from "../util/index.js";
import { InsertableContent } from "./proxies.js";
import {
	FieldKind,
	FieldSchema,
	type TreeNodeSchema,
	type ImplicitAllowedTypes,
	NodeKind,
	type AllowedTypes,
	type ImplicitFieldSchema,
} from "./schemaTypes.js";
import { nullSchema } from "./schemaFactory.js";
import { cachedFlexSchemaFromClassSchema } from "./toFlexSchema.js";

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
 * @param allowedTypes - The set of types allowed by the parent context. Used to validate the input tree.
 *
 * @returns A cursor (in nodes mode) for the mapped tree if the input data was defined. Otherwise, returns `undefined`.
 */
export function cursorFromNodeData(
	data: InsertableContent,
	allowedTypes: ImplicitAllowedTypes,
): CursorWithNode<MapTree> | undefined {
	if (data === undefined) {
		return undefined;
	}

	const mappedContent = nodeDataToMapTree(data, normalizeAllowedTypes(allowedTypes));
	return cursorForMapTreeNode(mappedContent);
}

type InsertableTreeField = InsertableContent | undefined;

/**
 * Transforms an input {@link TreeField} tree to an array of {@link MapTree}s, and wraps the tree in a {@link CursorWithNode}.
 * @param data - The input tree to be converted.
 * @param globalSchema - Schema for the whole tree for interperting `Any`.
 */
export function cursorFromFieldData(
	data: InsertableTreeField,
	fieldSchema: ImplicitFieldSchema,
): CursorWithNode<MapTree> {
	const mappedContent = fieldDataToMapTrees(data, normalizeFieldSchema(fieldSchema));
	return cursorForMapTreeField(mappedContent === undefined ? [] : [mappedContent]);
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
 * @param globalSchema - Schema for the whole tree for interperting `Any`.
 * @param nodeSchema - The set of types allowed by the parent context. Used to validate the input tree.
 */
export function nodeDataToMapTree(data: InsertableContent, nodeSchema: AllowedTypes): MapTree {
	assert(data !== undefined, 0x846 /* Cannot map undefined tree. */);

	if (data === null) {
		return valueToMapTree(data, nodeSchema);
	}
	switch (typeof data) {
		case "number":
		case "string":
		case "boolean":
			return valueToMapTree(data, nodeSchema);
		default: {
			if (isFluidHandle(data)) {
				return valueToMapTree(data, nodeSchema);
			} else if (Array.isArray(data)) {
				return arrayToMapTree(data, nodeSchema);
			} else if (data instanceof Map) {
				return mapToMapTree(data, nodeSchema);
			} else {
				// Assume record-like object
				return objectToMapTree(data as Record<string, InsertableContent>, nodeSchema);
			}
		}
	}
}

/**
 * Transforms an input {@link TreeField} tree to a {@link MapTree}, unless the s.
 * @param data - The input tree to be converted.
 * @param allowedTypes - TODO
 * @param optionalField - TODO
 */
export function fieldDataToMapTrees(
	data: InsertableTreeField,
	fieldSchema: NormalizedFieldSchema,
): MapTree | undefined {
	if (data === undefined) {
		if (fieldSchema.kind === FieldKind.Required) {
			fail("`undefined` provided for a required field.");
		} else {
			return undefined;
		}
	}

	return nodeDataToMapTree(data, fieldSchema.allowedTypes);
}

function valueToMapTree(
	// eslint-disable-next-line @rushstack/no-new-null
	value: boolean | number | string | IFluidHandle | null,
	typeSet: AllowedTypes,
): MapTree {
	const mappedValue = mapValueWithFallbacks(value, typeSet);

	const schema = getType(mappedValue, typeSet);
	assert(
		schema.kind === NodeKind.Leaf && allowsValue(schema, mappedValue),
		0x84a /* Unsupported schema for provided primitive. */,
	);

	return {
		value: mappedValue,
		type: brand(schema.identifier),
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
	allowedTypes: AllowedTypes,
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
				if (allowedTypes.includes(nullSchema)) {
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

function arrayToMapTree(data: InsertableContent[], typeSet: AllowedTypes): MapTree {
	const schema = getType(data, typeSet);
	if (schema.kind !== NodeKind.Array) {
		fail(`Provided array input is incompatible with schema "${schema.identifier}".`);
	}

	const allowedChildTypes = normalizeAllowedTypes(schema.info as ImplicitAllowedTypes);
	const childFieldSchema: NormalizedFieldSchema = {
		kind: FieldKind.Required,
		allowedTypes: allowedChildTypes,
	};

	const mappedChildren: MapTree[] = [];
	for (const child of data) {
		// We do not support undefined sequence entries.
		// If we encounter an undefined entry, use null instead if supported by the schema, otherwise throw.
		let childWithFallback = child;
		if (child === undefined) {
			if (childFieldSchema.allowedTypes.includes(nullSchema)) {
				childWithFallback = null;
			} else {
				throw new TypeError(`Received unsupported array entry value: ${child}.`);
			}
		}
		const mappedChild = fieldDataToMapTrees(childWithFallback, childFieldSchema);
		if (mappedChild !== undefined) {
			mappedChildren.push(mappedChild);
		}
	}

	const fieldsEntries: [FieldKey, MapTree[]][] =
		mappedChildren.length === 0 ? [] : [[EmptyKey, mappedChildren]];

	// Array node children are represented as a single field entry denoted with `EmptyKey`
	const fields = new Map<FieldKey, MapTree[]>(fieldsEntries);

	return {
		type: brand(schema.identifier),
		fields,
	};
}

function mapToMapTree(data: Map<string, InsertableContent>, typeSet: AllowedTypes): MapTree {
	const schema = getType(data, typeSet);
	if (schema.kind !== NodeKind.Map) {
		fail(`Provided map input is incompatible with schema "${schema.identifier}".`);
	}

	const allowedChildTypes = normalizeAllowedTypes(schema.info as ImplicitAllowedTypes);
	const childFieldSchema: NormalizedFieldSchema = {
		kind: FieldKind.Required,
		allowedTypes: allowedChildTypes,
	};

	const fields = new Map<FieldKey, MapTree[]>();
	for (const [key, value] of data) {
		assert(!fields.has(brand(key)), 0x84c /* Keys should not be duplicated */);

		// Omit undefined values - an entry with an undefined value is equivalent to one that has been removed or omitted
		if (value !== undefined) {
			const mappedField = fieldDataToMapTrees(value, childFieldSchema);
			if (mappedField !== undefined) {
				fields.set(brand(key), [mappedField]);
			}
		}
	}
	return {
		type: brand(schema.identifier),
		fields,
	};
}

function objectToMapTree(
	data: Record<string | number | symbol, InsertableContent>,
	typeSet: AllowedTypes,
): MapTree {
	const schema = getType(data, typeSet);
	if (schema.kind !== NodeKind.Object) {
		fail(`Provided object input is incompatible with schema "${schema.identifier}".`);
	}

	const fields = new Map<FieldKey, MapTree[]>();

	// Filter keys to only those that are strings - our trees do not support symbol or numeric property keys
	const keys = Reflect.ownKeys(data).filter((key) => typeof key === "string") as FieldKey[];

	for (const key of keys) {
		assert(!fields.has(key), 0x84d /* Keys should not be duplicated */);
		const fieldValue = data[key];

		// Omit undefined record entries - an entry with an undefined key is equivalent to no entry
		if (fieldValue !== undefined) {
			const fieldSchema = getObjectFieldSchema(schema, key);
			const mappedChildTree = fieldDataToMapTrees(fieldValue, fieldSchema);

			// TODO: use stableName when provided

			if (mappedChildTree !== undefined) {
				fields.set(key, [mappedChildTree]);
			}
		}
	}

	return {
		type: brand(schema.identifier),
		fields,
	};
}

function getObjectFieldSchema(schema: TreeNodeSchema, key: FieldKey): NormalizedFieldSchema {
	assert(schema.kind === NodeKind.Object, "Expected an object schema.");
	const fields = schema.info as Record<string, ImplicitFieldSchema>;
	if (fields[key] === undefined) {
		fail(`Field "${key}" not found in schema "${schema.identifier}".`);
	} else {
		return normalizeFieldSchema(fields[key]);
	}
}

function getType(data: InsertableContent, allowedTypes: AllowedTypes): TreeNodeSchema {
	const possibleTypes = getPossibleTypes(allowedTypes, data as ContextuallyTypedNodeData);
	assert(
		possibleTypes.length !== 0,
		0x84e /* data is incompatible with all types allowed by the schema */,
	);
	checkInput(
		possibleTypes.length === 1,
		() =>
			`The provided data is compatible with more than one type allowed by the schema.
The set of possible types is ${JSON.stringify(
				[...possibleTypes.map((schema) => schema.identifier)],
				undefined,
			)}.
Explicitly construct an unhydrated node of the desired type to disambiguate.
For class-based schema, this can be done by replacing an expression like "{foo: 1}" with "new MySchema({foo: 1})".`,
	);
	return possibleTypes[0];
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

/**
 * @returns all types for which the data is schema-compatible.
 */
export function getPossibleTypes(typeSet: AllowedTypes, data: ContextuallyTypedNodeData) {
	function evaluateLazy(value: LazyItem<TreeNodeSchema>): TreeNodeSchema {
		if (isLazy(value)) {
			return (value as () => TreeNodeSchema)();
		}
		return value;
	}

	const possibleTypes: TreeNodeSchema[] = [];
	for (const typeSetEntry of typeSet) {
		const schema = evaluateLazy(typeSetEntry);
		if (shallowCompatibilityTest(schema, data)) {
			possibleTypes.push(schema);
		}
	}
	return possibleTypes;
}

function normalizeAllowedTypes(types: ImplicitAllowedTypes): AllowedTypes {
	return isReadonlyArray(types) ? types : [types];
}

export interface NormalizedFieldSchema {
	kind: FieldKind;
	allowedTypes: AllowedTypes;
}

/**
 * TODO
 */
export function normalizeFieldSchema(schema: ImplicitFieldSchema): NormalizedFieldSchema {
	let kind: FieldKind;
	let allowedTypes: ImplicitAllowedTypes;
	if (schema instanceof FieldSchema) {
		kind = schema.kind;
		allowedTypes = schema.allowedTypes;
	} else {
		kind = FieldKind.Required;
		allowedTypes = schema;
	}
	return {
		kind,
		allowedTypes: normalizeAllowedTypes(allowedTypes),
	};
}

/**
 * Checks if data might be schema-compatible.
 *
 * @returns false if `data` is incompatible with `type` based on a cheap/shallow check.
 *
 * Note that this may return true for cases where data is incompatible, but it must not return false in cases where the data is compatible.
 */
function shallowCompatibilityTest(
	schema: TreeNodeSchema,
	data: ContextuallyTypedNodeData,
): boolean {
	assert(
		data !== undefined,
		0x889 /* undefined cannot be used as contextually typed data. Use ContextuallyTypedFieldData. */,
	);

	if (isTreeValue(data)) {
		return allowsValue(schema, data);
	}
	if (schema.kind === NodeKind.Leaf) {
		return false;
	}

	if (typeNameSymbol in data) {
		return data[typeNameSymbol] === schema.identifier;
	}

	if (isReadonlyArray(data)) {
		return schema.kind === NodeKind.Array;
	}
	if (schema.kind === NodeKind.Array) {
		return false;
	}

	if (data instanceof Map) {
		return schema.kind === NodeKind.Map;
	}
	if (schema.kind === NodeKind.Map) {
		return false;
	}

	// For now, consider all not explicitly typed objects shallow compatible.
	// This will require explicit differentiation in polymorphic cases rather than automatic structural differentiation.

	return true;
}

function allowsValue(schema: TreeNodeSchema, value: TreeValue): boolean {
	if (schema.kind === NodeKind.Leaf) {
		// TODO: better option?
		// TODO: document why this is safe
		const flexSchema =
			cachedFlexSchemaFromClassSchema(schema) ?? fail("leaf schema should be pre-cached");
		assert(schemaIsLeaf(flexSchema), 0x840 /* expected leaf */);

		return flexSchemaAllowsValue(flexSchema.leafValue, value);
	}
	return false;
}

/**
 * Content of a tree which needs external schema information to interpret.
 *
 * This format is intended for concise authoring of tree literals when the schema is statically known.
 *
 * Once schema aware APIs are implemented, they can be used to provide schema specific subsets of this type.
 */
export type ContextuallyTypedNodeData =
	| ContextuallyTypedNodeDataObject
	| number
	| string
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| readonly ContextuallyTypedNodeData[];

/**
 * Content of a field which needs external schema information to interpret.
 *
 * This format is intended for concise authoring of tree literals when the schema is statically known.
 *
 * Once schema aware APIs are implemented, they can be used to provide schema specific subsets of this type.
 */
export type ContextuallyTypedFieldData = ContextuallyTypedNodeData | undefined;

/**
 * Object case of {@link ContextuallyTypedNodeData}.
 */
export interface ContextuallyTypedNodeDataObject {
	/**
	 * The type of the node.
	 * If this node is well-formed, it must follow this schema.
	 */
	readonly [typeNameSymbol]?: string;

	/**
	 * Fields of this node, indexed by their field keys.
	 *
	 * Allow explicit undefined for compatibility with EditableTree, and type-safety on read.
	 */
	// TODO: make sure explicit undefined is actually handled correctly.
	[key: FieldKey]: ContextuallyTypedFieldData;

	/**
	 * Fields of this node, indexed by their field keys as strings.
	 *
	 * Allow unbranded field keys as a convenience for literals.
	 */
	[key: string]: ContextuallyTypedFieldData;
}
