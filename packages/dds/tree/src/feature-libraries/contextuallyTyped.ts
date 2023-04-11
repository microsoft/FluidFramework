/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { brand, fail } from "../util";
import {
	EmptyKey,
	FieldKey,
	isGlobalFieldKey,
	keyFromSymbol,
	Value,
	TreeSchema,
	ValueSchema,
	FieldSchema,
	LocalFieldKey,
	SchemaDataAndPolicy,
	lookupGlobalFieldSchema,
	TreeSchemaIdentifier,
	lookupTreeSchema,
	TreeTypeSet,
	MapTree,
	symbolIsFieldKey,
	ITreeCursorSynchronous,
} from "../core";
// TODO:
// This module currently is assuming use of defaultFieldKinds.
// The field kinds should instead come from a view schema registry thats provided somewhere.
import { fieldKinds } from "./defaultFieldKinds";
import { FieldKind, Multiplicity } from "./modular-schema";
import { singleMapTreeCursor } from "./mapTreeCursor";
import { isPrimitive } from "./editable-tree";

/**
 * This library defines a tree data format that can infer its types from context.
 * It can only be used when the schema is known.
 * The format is optimized for ergonomics when the developer knows the schema,
 * and needs to declare or navigate trees.
 *
 * The format defined here is very tolerant to optimize for flexibility of expressing trees:
 * APIs exposing data in this format should likely further constrain what is allowed.
 * For example guarantee which fields and nodes should be inlined, and that types will be required everywhere.
 * See {@link EditableTree} for an example of this.
 */

/**
 * String which identifies this code.
 * Targeted at developers: can be used for symbol strings, or other developer targeted strings,
 * like error messages.
 */
const scope = "contextuallyTyped";

/**
 * A symbol for the name of the type of a tree in contexts where string keys are already in use for fields.
 * See {@link TreeSchemaIdentifier}.
 * @alpha
 */
export const typeNameSymbol: unique symbol = Symbol(`${scope}:typeName`);

/**
 * A symbol for the value of a tree node in contexts where string keys are already in use for fields.
 * @alpha
 */
export const valueSymbol: unique symbol = Symbol(`${scope}:value`);

/**
 * @alpha
 */
export type PrimitiveValue = string | boolean | number;

/**
 * @alpha
 */
export function isPrimitiveValue(nodeValue: Value): nodeValue is PrimitiveValue {
	return nodeValue !== undefined && typeof nodeValue !== "object";
}

export function allowsValue(schema: ValueSchema, nodeValue: Value): boolean {
	switch (schema) {
		case ValueSchema.String:
			return typeof nodeValue === "string";
		case ValueSchema.Number:
			return typeof nodeValue === "number";
		case ValueSchema.Boolean:
			return typeof nodeValue === "boolean";
		case ValueSchema.Nothing:
			return typeof nodeValue === "undefined";
		case ValueSchema.Serializable:
			return true;
		default:
			fail("invalid value schema");
	}
}

/**
 * @returns the key and the schema of the primary field out of the given tree schema.
 *
 * See note on {@link EmptyKey} for what is a primary field.
 * @alpha
 */
export function getPrimaryField(
	schema: TreeSchema,
): { key: LocalFieldKey; schema: FieldSchema } | undefined {
	// TODO: have a better mechanism for this. See note on EmptyKey.
	const field = schema.localFields.get(EmptyKey);
	if (field === undefined) {
		return undefined;
	}
	return { key: EmptyKey, schema: field };
}

// TODO: this (and most things in this file) should use ViewSchema, and already have the full kind information.
export function getFieldSchema(
	field: FieldKey,
	schemaData: SchemaDataAndPolicy,
	schema?: TreeSchema,
): FieldSchema {
	if (isGlobalFieldKey(field)) {
		return lookupGlobalFieldSchema(schemaData, keyFromSymbol(field));
	}
	assert(
		schema !== undefined,
		0x423 /* The field is a local field, a parent schema is required. */,
	);
	return schema.localFields.get(field) ?? schema.extraLocalFields;
}

export function getFieldKind(fieldSchema: FieldSchema): FieldKind {
	// TODO:
	// This module currently is assuming use of defaultFieldKinds.
	// The field kinds should instead come from a view schema registry thats provided somewhere.
	return fieldKinds.get(fieldSchema.kind.identifier) ?? fail("missing field kind");
}

/**
 * @returns all allowed child types for `typeSet`.
 */
export function getAllowedTypes(
	schema: SchemaDataAndPolicy,
	typeSet: TreeTypeSet,
): ReadonlySet<TreeSchemaIdentifier> {
	// TODO: Performance: avoid the `undefined` case being frequent, possibly with caching in the caller of `getPossibleChildTypes`.
	return typeSet ?? new Set(schema.treeSchema.keys());
}

/**
 * @returns all types, for which the data is schema-compatible.
 */
export function getPossibleTypes(
	schemaData: SchemaDataAndPolicy,
	typeSet: TreeTypeSet,
	data: ContextuallyTypedNodeData,
) {
	// All types allowed by schema
	const allowedTypes = getAllowedTypes(schemaData, typeSet);

	const possibleTypes: TreeSchemaIdentifier[] = [];
	for (const allowed of allowedTypes) {
		if (shallowCompatibilityTest(schemaData, allowed, data)) {
			possibleTypes.push(allowed);
		}
	}
	return possibleTypes;
}

/**
 * A symbol used to define a {@link MarkedArrayLike} interface.
 * @alpha
 */
export const arrayLikeMarkerSymbol: unique symbol = Symbol("editable-tree:arrayLikeMarker");

/**
 * Can be used to mark a type which works like an array, but is not compatible with `Array.isArray`.
 * @alpha
 */
export interface MarkedArrayLike<TGet, TSet extends TGet = TGet> extends ArrayLikeMut<TGet, TSet> {
	readonly [arrayLikeMarkerSymbol]: true;
	[Symbol.iterator](): IterableIterator<TGet>;
}

/**
 * `ArrayLike` numeric indexed access, but writable.
 *
 * @remarks
 * Note that due to language limitations, this also allows reading as TSet.
 * This is why `TSet extends TGet` is required.
 *
 * See https://github.com/microsoft/TypeScript/issues/43826.
 * @alpha
 */
export interface ArrayLikeMut<TGet, TSet extends TGet = TGet> extends ArrayLike<TGet> {
	[n: number]: TSet;
}

/**
 * Content of a tree which needs external schema information to interpret.
 *
 * This format is intended for concise authoring of tree literals when the schema is statically known.
 *
 * Once schema aware APIs are implemented, they can be used to provide schema specific subsets of this type.
 * @alpha
 */
export type ContextuallyTypedNodeData =
	| ContextuallyTypedNodeDataObject
	| PrimitiveValue
	| readonly ContextuallyTypedNodeData[]
	| MarkedArrayLike<ContextuallyTypedNodeData>;

/**
 * Content of a field which needs external schema information to interpret.
 *
 * This format is intended for concise authoring of tree literals when the schema is statically known.
 *
 * Once schema aware APIs are implemented, they can be used to provide schema specific subsets of this type.
 * @alpha
 */
export type ContextuallyTypedFieldData = ContextuallyTypedNodeData | undefined;

/**
 * Checks the type of a `ContextuallyTypedNodeData`.
 */
export function isArrayLike(
	data: ContextuallyTypedFieldData,
): data is readonly ContextuallyTypedNodeData[] | MarkedArrayLike<ContextuallyTypedNodeData> {
	return isWritableArrayLike(data) || Array.isArray(data);
}

/**
 * Checks the type of a `ContextuallyTypedNodeData`.
 * @alpha
 */
export function isWritableArrayLike(
	data: ContextuallyTypedFieldData,
): data is MarkedArrayLike<ContextuallyTypedNodeData> {
	if (typeof data !== "object") {
		return false;
	}
	return (
		(data as Partial<MarkedArrayLike<ContextuallyTypedNodeData>>)[arrayLikeMarkerSymbol] ===
		true
	);
}

/**
 * Checks the type of a `ContextuallyTypedNodeData`.
 * @alpha
 */
export function isContextuallyTypedNodeDataObject(
	data: ContextuallyTypedNodeData | undefined,
): data is ContextuallyTypedNodeDataObject {
	return !(isPrimitiveValue(data) || isArrayLike(data) || data === null);
}

/**
 * Object case of {@link ContextuallyTypedNodeData}.
 * @alpha
 */
export interface ContextuallyTypedNodeDataObject {
	/**
	 * Value stored on this node.
	 */
	readonly [valueSymbol]?: Value;

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
	 * Allow unbranded local field keys and a convenience for literals.
	 */
	[key: string]: ContextuallyTypedFieldData;
}

/**
 * Checks if data might be schema-compatible.
 *
 * @returns false if `data` is incompatible with `type` based on a cheap/shallow check.
 *
 * Note that this may return true for cases where data is incompatible, but it must not return false in cases where the data is compatible.
 */
function shallowCompatibilityTest(
	schemaData: SchemaDataAndPolicy,
	type: TreeSchemaIdentifier,
	data: ContextuallyTypedNodeData,
): boolean {
	const schema = lookupTreeSchema(schemaData, type);
	if (isPrimitiveValue(data)) {
		return isPrimitive(schema) && allowsValue(schema.value, data);
	}
	if (isArrayLike(data)) {
		const primary = getPrimaryField(schema);
		return (
			primary !== undefined &&
			getFieldKind(primary.schema).multiplicity === Multiplicity.Sequence
		);
	}
	if (data[typeNameSymbol] !== undefined) {
		return data[typeNameSymbol] === type;
	}
	// For now, consider all not explicitly typed objects shallow compatible.
	// This will require explicit differentiation in polymorphic cases rather than automatic structural differentiation.

	// Special case primitive schema to not be compatible with data with local fields.
	if (isPrimitive(schema)) {
		if (fieldKeysFromData(data).length > 0) {
			return false;
		}
	}

	return true;
}

/**
 * Construct a tree from ContextuallyTypedNodeData.
 *
 * TODO: this should probably be refactored into a `try` function which either returns a Cursor or a SchemaError with a path to the error.
 * @alpha
 */
export function cursorFromContextualData(
	schemaData: SchemaDataAndPolicy,
	typeSet: TreeTypeSet,
	data: ContextuallyTypedNodeData,
): ITreeCursorSynchronous {
	const mapTree = applyTypesFromContext(schemaData, typeSet, data);
	return singleMapTreeCursor(mapTree);
}

/**
 * Construct a tree from ContextuallyTypedNodeData.
 *
 * TODO: this should probably be refactored into a `try` function which either returns a Cursor or a SchemaError with a path to the error.
 * TODO: migrate APIs which take arrays of cursors to take cursors in fields mode.
 */
export function cursorsFromContextualData(
	schemaData: SchemaDataAndPolicy,
	field: FieldSchema,
	data: ContextuallyTypedNodeData | undefined,
): ITreeCursorSynchronous[] {
	const mapTrees = applyFieldTypesFromContext(schemaData, field, data);
	return mapTrees.map(singleMapTreeCursor);
}

/**
 * Construct a MapTree from ContextuallyTypedNodeData.
 *
 * TODO: this should probably be refactored into a `try` function which either returns a MapTree or a SchemaError with a path to the error.
 * TODO: test suite.
 *
 * @remarks
 * This version is only exported as a more testable entry point than `cursorFromContextualData` which keeps the use of `MapTree` as an implementation detail.
 * This should not be reexported from the parent module.
 */
export function applyTypesFromContext(
	schemaData: SchemaDataAndPolicy,
	typeSet: TreeTypeSet,
	data: ContextuallyTypedNodeData,
): MapTree {
	const possibleTypes: TreeSchemaIdentifier[] = getPossibleTypes(schemaData, typeSet, data);

	assert(
		possibleTypes.length !== 0,
		0x4d4 /* data incompatible with all types allowed by the schema */,
	);
	assert(
		possibleTypes.length === 1,
		0x4d5 /* data compatible with more than one type allowed by the schema */,
	);

	const type = possibleTypes[0];
	const schema = lookupTreeSchema(schemaData, type);
	if (isPrimitiveValue(data)) {
		// This check avoids returning an out of schema node
		// in the case where schema permits the value, but has required fields.
		assert(isPrimitive(schema), "Schema must be primitive when providing a primitive value");
		assert(
			allowsValue(schema.value, data),
			0x4d3 /* unsupported schema for provided primitive */,
		);
		return { value: data, type, fields: new Map() };
	} else if (isArrayLike(data)) {
		const primary = getPrimaryField(schema);
		assert(
			primary !== undefined,
			0x4d6 /* array data reported comparable with the schema without a primary field */,
		);
		const children = applyFieldTypesFromContext(schemaData, primary.schema, data);
		return { value: undefined, type, fields: new Map([[primary.key, children]]) };
	} else {
		const fields: Map<FieldKey, MapTree[]> = new Map(
			fieldKeysFromData(data).map((key) => {
				const childKey: FieldKey = brand(key);
				const childSchema = getFieldSchema(childKey, schemaData, schema);
				return [
					childKey,
					applyFieldTypesFromContext(schemaData, childSchema, data[childKey]),
				];
			}),
		);
		const value = data[valueSymbol];
		assert(
			allowsValue(schema.value, value),
			0x4d7 /* provided value not permitted by the schema */,
		);
		return { value, type, fields };
	}
}

function fieldKeysFromData(data: ContextuallyTypedNodeDataObject): FieldKey[] {
	const keys: (string | symbol)[] = Reflect.ownKeys(data).filter(
		(key) => typeof key === "string" || symbolIsFieldKey(key),
	);
	return keys as FieldKey[];
}

/**
 * Construct a MapTree from ContextuallyTypedNodeData.
 *
 * TODO: this should probably be refactored into a `try` function which either returns a MapTree or a SchemaError with a path to the error.
 * TODO: test suite.
 *
 * @remarks
 * This version is only exported as a more testable entry point than `cursorsFromContextualData` which keeps the use of `MapTree` as an implementation detail.
 * This should not be reexported from the parent module.
 */
export function applyFieldTypesFromContext(
	schemaData: SchemaDataAndPolicy,
	field: FieldSchema,
	data: ContextuallyTypedFieldData,
): MapTree[] {
	const multiplicity = getFieldKind(field).multiplicity;
	if (data === undefined) {
		assert(
			multiplicity === Multiplicity.Forbidden || multiplicity === Multiplicity.Optional,
			0x4d8 /* `undefined` provided for a field that does not support `undefined` */,
		);
		return [];
	}
	if (multiplicity === Multiplicity.Sequence) {
		assert(isArrayLike(data), 0x4d9 /* expected array for a sequence field */);
		const children = Array.from(data, (child) =>
			applyTypesFromContext(schemaData, field.types, child),
		);
		return children;
	}
	assert(
		multiplicity === Multiplicity.Value || multiplicity === Multiplicity.Optional,
		0x4da /* single value provided for an unsupported field */,
	);
	return [applyTypesFromContext(schemaData, field.types, data)];
}
