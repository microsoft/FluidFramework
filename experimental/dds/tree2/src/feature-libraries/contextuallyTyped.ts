/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { fail, isReadonlyArray } from "../util";
import {
	EmptyKey,
	FieldKey,
	Value,
	TreeNodeStoredSchema,
	TreeFieldStoredSchema,
	TreeNodeSchemaIdentifier,
	TreeTypeSet,
	MapTree,
	ITreeCursorSynchronous,
	TreeStoredSchema,
	isCursor,
} from "../core";
// TODO:
// This module currently is assuming use of default-field-kinds.
// The field kinds should instead come from a view schema registry thats provided somewhere.
import { fieldKinds } from "./default-schema";
import { FieldKind, Multiplicity } from "./modular-schema";
import {
	AllowedTypes,
	TreeFieldSchema,
	TreeNodeSchema,
	allowedTypesToTypeSet,
} from "./typed-schema";
import { cursorForMapTreeNode } from "./mapTreeCursor";
import { AllowedTypesToTypedTrees, ApiMode, TypedField, TypedNode } from "./schema-aware";
import { isFluidHandle, allowsValue } from "./valueUtilities";
import { TreeDataContext } from "./fieldGenerator";

/**
 * This library defines a tree data format that can infer its types from context.
 * It can only be used when the schema is known.
 * The format is optimized for ergonomics when the developer knows the schema,
 * and needs to declare or navigate trees.
 *
 * The format defined here is very tolerant to optimize for flexibility of expressing trees:
 * APIs exposing data in this format should likely further constrain what is allowed.
 * For example guarantee which fields and nodes should be inlined, and that types will be required everywhere.
 *
 * This is from Editable tree one which has been deleted and should no longer be used!
 */

/**
 * Check if NewFieldContent is made of {@link ITreeCursor}s.
 *
 * Useful when APIs want to take in tree data in multiple formats, including cursors.
 */
export function areCursors(
	data: NewFieldContent,
): data is ITreeCursorSynchronous | readonly ITreeCursorSynchronous[] {
	if (isCursor(data)) {
		return true;
	}

	if (Array.isArray(data) && data.length >= 0 && isCursor(data[0])) {
		return true;
	}

	return false;
}

/**
 * @returns true iff `schema` trees should default to being viewed as just their value when possible.
 * @deprecated This definition of Primitive is from editable-tree-1 and should not be used.
 * @remarks
 * TODO:
 * This (like most things in this file) works with stored schema doing things that should be done with view schema.
 * This just replicates the old editable-tree policy: this entire file should get replaced with the new factory based approach which has access to view schema to align this with how LeafSchema work.
 * @alpha
 */
export function isPrimitive(schema: TreeNodeStoredSchema): boolean {
	// TODO: use a separate `ITreeSchema` type, with metadata that determines if the type is primitive.
	// Since the above is not done yet, use use a heuristic:
	return (
		schema.leafValue !== undefined &&
		schema.objectNodeFields.size === 0 &&
		schema.mapFields === undefined
	);
}

/**
 * String which identifies this code.
 * Targeted at developers: can be used for symbol strings, or other developer targeted strings,
 * like error messages.
 */
const scope = "contextuallyTyped";

/**
 * A symbol for the name of the type of a tree in contexts where string keys are already in use for fields.
 * See {@link TreeNodeSchemaIdentifier}.
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
 * @deprecated This definition of PrimitiveValue is from editable-tree-1 and should not be used.
 * @privateRemarks
 * TODO: remove from package API when old editable-tree API is removed
 */
export type PrimitiveValue = string | boolean | number;

/**
 * Checks if a value is a {@link PrimitiveValue}.
 * @deprecated This definition of PrimitiveValue is from editable-tree-1 and should not be used.
 */
export function isPrimitiveValue(nodeValue: unknown): nodeValue is PrimitiveValue {
	switch (typeof nodeValue) {
		case "string":
		case "number":
		case "boolean":
			return true;
		default:
			return false;
	}
}

/**
 * @returns the key and the schema of the primary field out of the given tree schema.
 *
 * See note on {@link EmptyKey} for what is a primary field.
 * @alpha
 */
export function getPrimaryField(
	schema: TreeNodeStoredSchema,
): { key: FieldKey; schema: TreeFieldStoredSchema } | undefined {
	// TODO: have a better mechanism for this. See note on EmptyKey.
	const field = schema.objectNodeFields.get(EmptyKey);
	if (field === undefined) {
		return undefined;
	}
	return { key: EmptyKey, schema: field };
}

// TODO: this (and most things in this file) should use ViewSchema, and already have the full kind information.
export function getFieldSchema(
	field: FieldKey,
	schema: TreeNodeStoredSchema,
): TreeFieldStoredSchema {
	return schema.objectNodeFields.get(field) ?? schema.mapFields ?? TreeFieldSchema.empty;
}

export function getFieldKind(fieldSchema: TreeFieldStoredSchema): FieldKind {
	// TODO:
	// This module currently is assuming use of defaultFieldKinds.
	// The field kinds should instead come from a view schema registry thats provided somewhere.
	return fieldKinds.get(fieldSchema.kind.identifier) ?? fail("missing field kind");
}

/**
 * @returns all allowed child types for `typeSet`.
 */
export function getAllowedTypes(
	schemaData: TreeStoredSchema,
	typeSet: TreeTypeSet,
): ReadonlySet<TreeNodeSchemaIdentifier> {
	// TODO: Performance: avoid the `undefined` case being frequent, possibly with caching in the caller of `getPossibleChildTypes`.
	return typeSet ?? new Set(schemaData.nodeSchema.keys());
}

/**
 * @returns all types, for which the data is schema-compatible.
 */
export function getPossibleTypes(
	context: TreeDataContext,
	typeSet: TreeTypeSet,
	data: ContextuallyTypedNodeData,
) {
	// All types allowed by schema
	const allowedTypes = getAllowedTypes(context.schema, typeSet);

	const possibleTypes: TreeNodeSchemaIdentifier[] = [];
	for (const allowed of allowedTypes) {
		if (shallowCompatibilityTest(context.schema, allowed, data)) {
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
 * Can be used to mark a type which works like an array, but is not compatible with `Array.isArray`.
 * @alpha
 */
export interface ReadonlyMarkedArrayLike<T> extends ArrayLike<T> {
	readonly [arrayLikeMarkerSymbol]: true;
	[Symbol.iterator](): IterableIterator<T>;
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
): data is
	| readonly ContextuallyTypedNodeData[]
	| ReadonlyMarkedArrayLike<ContextuallyTypedNodeData> {
	if (typeof data !== "object" || data === null) {
		return false;
	}
	return (
		(data as Partial<MarkedArrayLike<ContextuallyTypedNodeData>>)[arrayLikeMarkerSymbol] ===
			true || Array.isArray(data)
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
	 * Allow unbranded field keys as a convenience for literals.
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
	schemaData: TreeStoredSchema,
	type: TreeNodeSchemaIdentifier,
	data: ContextuallyTypedNodeData,
): boolean {
	assert(!areCursors(data), 0x6b1 /* cursors cannot be used as contextually typed data. */);
	assert(
		data !== undefined,
		0x6b2 /* undefined cannot be used as contextually typed data. Use ContextuallyTypedFieldData. */,
	);
	const schema =
		schemaData.nodeSchema.get(type) ?? fail("requested type does not exist in schema");
	if (isPrimitiveValue(data) || data === null || isFluidHandle(data)) {
		return allowsValue(schema.leafValue, data);
	}
	// TODO: once this is using view schema, replace with schemaIsLeaf
	if (schema.leafValue !== undefined) {
		// Reject objects with no value from being leaf nodes.
		// Note that if allowing IFluidHandles without wrapping them in a leaf node object,
		// this (or the above isPrimitiveValue) would have to change.
		if ((data as ContextuallyTypedNodeDataObject)[valueSymbol] === undefined) {
			return false;
		}
	}
	if (isArrayLike(data)) {
		const primary = getPrimaryField(schema);
		return (
			primary !== undefined &&
			getFieldKind(primary.schema).multiplicity === Multiplicity.Sequence
		);
	}
	if (data instanceof Map) {
		return schema.mapFields !== undefined;
	}
	if (data[typeNameSymbol] !== undefined) {
		return data[typeNameSymbol] === type;
	}
	// For now, consider all not explicitly typed objects shallow compatible.
	// This will require explicit differentiation in polymorphic cases rather than automatic structural differentiation.

	// Special case primitive schema to not be compatible with data with fields.
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
 * @returns a cursor in Nodes mode for a single node containing the provided data.
 * @alpha
 */
export function cursorFromContextualData(
	context: TreeDataContext,
	typeSet: TreeTypeSet,
	data: ContextuallyTypedNodeData,
): ITreeCursorSynchronous {
	const mapTree = applyTypesFromContext(context, typeSet, data);
	return cursorForMapTreeNode(mapTree);
}

/**
 * Strongly typed {@link cursorFromContextualData} for a TreeNodeSchema.
 * @returns a cursor in Nodes mode for a single node containing the provided data.
 * @alpha
 */
export function cursorForTypedTreeData<T extends TreeNodeSchema>(
	context: TreeDataContext,
	schema: T,
	data: TypedNode<T, ApiMode.Simple>,
): ITreeCursorSynchronous {
	return cursorFromContextualData(
		context,
		new Set([schema.name]),
		data as ContextuallyTypedNodeData,
	);
}

/**
 * Strongly typed {@link cursorFromContextualData} for AllowedTypes.
 * @returns a cursor in Nodes mode for a single node containing the provided data.
 * @alpha
 */
export function cursorForTypedData<T extends AllowedTypes>(
	context: TreeDataContext,
	schema: T,
	data: AllowedTypesToTypedTrees<ApiMode.Simple, T>,
): ITreeCursorSynchronous {
	return cursorFromContextualData(
		context,
		allowedTypesToTypeSet(schema),
		data as unknown as ContextuallyTypedNodeData,
	);
}

/**
 * Construct a tree from ContextuallyTypedNodeData.
 *
 * TODO: this should probably be refactored into a `try` function which either returns a Cursor or a SchemaError with a path to the error.
 * TODO: migrate APIs which take arrays of cursors to take cursors in fields mode.
 */
export function cursorsFromContextualData(
	context: TreeDataContext,
	field: TreeFieldStoredSchema,
	data: ContextuallyTypedNodeData | undefined,
): ITreeCursorSynchronous[] {
	const mapTrees = applyFieldTypesFromContext(context, field, data);
	return mapTrees.map(cursorForMapTreeNode);
}

/**
 * Strongly typed {@link cursorsFromContextualData} for a TreeFieldSchema
 * @alpha
 */
export function cursorsForTypedFieldData<T extends TreeFieldSchema>(
	context: TreeDataContext,
	schema: T,
	data: TypedField<T, ApiMode.Flexible>,
): ITreeCursorSynchronous[] {
	return cursorsFromContextualData(context, schema, data as ContextuallyTypedNodeData);
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
	context: TreeDataContext,
	typeSet: TreeTypeSet,
	data: ContextuallyTypedNodeData,
): MapTree {
	const possibleTypes: TreeNodeSchemaIdentifier[] = getPossibleTypes(context, typeSet, data);

	assert(
		possibleTypes.length !== 0,
		0x4d4 /* data incompatible with all types allowed by the schema */,
	);
	assert(
		possibleTypes.length === 1,
		0x4d5 /* data compatible with more than one type allowed by the schema */,
	);

	const type = possibleTypes[0];
	const schema =
		context.schema.nodeSchema.get(type) ?? fail("requested type does not exist in schema");

	if (isPrimitiveValue(data) || data === null || isFluidHandle(data)) {
		assert(
			allowsValue(schema.leafValue, data),
			0x4d3 /* unsupported schema for provided primitive */,
		);
		return { value: data, type, fields: new Map() };
	} else if (isArrayLike(data)) {
		const primary = getPrimaryField(schema);
		assert(
			primary !== undefined,
			0x4d6 /* array data reported comparable with the schema without a primary field */,
		);
		const children = applyFieldTypesFromContext(context, primary.schema, data);
		return {
			value: undefined,
			type,
			fields: new Map(children.length > 0 ? [[primary.key, children]] : []),
		};
	} else if (data instanceof Map) {
		const fields: Map<FieldKey, MapTree[]> = new Map();
		for (const [key, value] of data) {
			assert(!fields.has(key), 0x7f0 /* Keys should not be duplicated */);
			const childSchema = getFieldSchema(key, schema);
			const children = applyFieldTypesFromContext(context, childSchema, value);

			if (children.length > 0) {
				fields.set(key, children);
			}
		}

		return {
			value: undefined,
			type,
			fields,
		};
	} else {
		const fields: Map<FieldKey, MapTree[]> = new Map();
		for (const key of fieldKeysFromData(data)) {
			assert(!fields.has(key), 0x6b3 /* Keys should not be duplicated */);
			const childSchema = getFieldSchema(key, schema);
			const children = applyFieldTypesFromContext(context, childSchema, data[key]);

			if (children.length > 0) {
				fields.set(key, children);
			}
		}

		for (const key of schema.objectNodeFields.keys()) {
			if (data[key] === undefined) {
				setFieldForKey(key, context, schema, fields);
			}
		}

		const value = data[valueSymbol];
		assert(
			allowsValue(schema.leafValue, value),
			0x4d7 /* provided value not permitted by the schema */,
		);
		return { value, type, fields };
	}
}

function setFieldForKey(
	key: FieldKey,
	context: TreeDataContext,
	schema: TreeNodeStoredSchema,
	fields: Map<FieldKey, MapTree[]>,
): void {
	const requiredFieldSchema = getFieldSchema(key, schema);
	const multiplicity = getFieldKind(requiredFieldSchema).multiplicity;
	if (multiplicity === Multiplicity.Single && context.fieldSource !== undefined) {
		const fieldGenerator = context.fieldSource(key, requiredFieldSchema);
		if (fieldGenerator !== undefined) {
			const children = fieldGenerator();
			fields.set(key, children);
		}
	}
}

function fieldKeysFromData(data: ContextuallyTypedNodeDataObject): FieldKey[] {
	const keys: (string | symbol)[] = Reflect.ownKeys(data).filter(
		(key) => typeof key === "string",
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
	context: TreeDataContext,
	field: TreeFieldStoredSchema,
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
			applyTypesFromContext(context, field.types, child),
		);
		return children;
	}
	assert(
		multiplicity === Multiplicity.Single || multiplicity === Multiplicity.Optional,
		0x4da /* single value provided for an unsupported field */,
	);
	return [applyTypesFromContext(context, field.types, data)];
}

/**
 * Content to use for a field.
 *
 * When used, this content will be deeply copied into the tree, and must comply with the schema.
 *
 * The content must follow the {@link Multiplicity} of the {@link FieldKind}:
 * - use a single cursor for an `optional` or `value` field;
 * - use array of cursors for a `sequence` field;
 *
 * TODO: this should allow a field cursor instead of an array of cursors.
 * TODO: Make this generic so a variant of this type that allows placeholders for detached sequences to consume.
 * @alpha
 */
export type NewFieldContent =
	| ITreeCursorSynchronous
	| readonly ITreeCursorSynchronous[]
	| ContextuallyTypedFieldData;

/**
 * Convert NewFieldContent into ITreeCursor array.
 */
export function normalizeNewFieldContent(
	context: TreeDataContext,
	schema: TreeFieldStoredSchema,
	content: NewFieldContent,
): readonly ITreeCursorSynchronous[] {
	if (areCursors(content)) {
		if (getFieldKind(schema).multiplicity === Multiplicity.Sequence) {
			assert(isReadonlyArray(content), 0x6b7 /* sequence fields require array content */);
			return content;
		} else {
			if (isReadonlyArray(content)) {
				assert(
					content.length === 1,
					0x6b8 /* non-sequence fields can not be provided content that is multiple cursors */,
				);
				return content;
			}
			return [content];
		}
	}

	return cursorsFromContextualData(context, schema, content);
}
