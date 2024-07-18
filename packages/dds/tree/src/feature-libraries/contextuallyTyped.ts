/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import {
	CursorLocationType,
	EmptyKey,
	type FieldKey,
	type ITreeCursorSynchronous,
	type MapTree,
	type Value,
	isCursor,
	Multiplicity,
} from "../core/index.js";
import { fail, isReadonlyArray } from "../util/index.js";

// TODO:
// This module currently is assuming use of default-field-kinds.
// The field kinds should instead come from a view schema registry thats provided somewhere.
import { fieldKinds } from "./default-schema/index.js";
import type { TreeDataContext } from "./fieldGenerator.js";
import {
	cursorForMapTreeField,
	cursorForMapTreeNode,
	mapTreeFromCursor,
} from "./mapTreeCursor.js";
import type { FlexFieldKind } from "./modular-schema/index.js";
import type {
	AllowedTypesToFlexInsertableTree,
	InsertableFlexField,
	InsertableFlexNode,
} from "./schema-aware/index.js";
import {
	type AllowedTypeSet,
	Any,
	type FlexAllowedTypes,
	FlexFieldNodeSchema,
	type FlexFieldSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	type FlexTreeNodeSchema,
	type FlexTreeSchema,
	LeafNodeSchema,
	allowedTypesSchemaSet,
} from "./typed-schema/index.js";
import { allowsValue, isTreeValue } from "./valueUtilities.js";

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
 * This is from Flex tree one which has been deleted and should no longer be used!
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
 * String which identifies this code.
 * Targeted at developers: can be used for symbol strings, or other developer targeted strings,
 * like error messages.
 */
const scope = "contextuallyTyped";

/**
 * A symbol for the name of the type of a tree in contexts where string keys are already in use for fields.
 * See {@link TreeNodeSchemaIdentifier}.
 * @internal
 */
export const typeNameSymbol: unique symbol = Symbol(`${scope}:typeName`);

/**
 * A symbol for the value of a tree node in contexts where string keys are already in use for fields.
 * @internal
 */
export const valueSymbol: unique symbol = Symbol(`${scope}:value`);

export function getFieldKind(fieldSchema: FlexFieldSchema): FlexFieldKind {
	// TODO:
	// This module currently is assuming use of defaultFieldKinds.
	// The field kinds should instead come from a view schema registry thats provided somewhere.
	return fieldKinds.get(fieldSchema.kind.identifier) ?? fail("missing field kind");
}

/**
 * @returns all allowed child types for `typeSet`.
 */
export function getAllowedTypes(
	schemaData: FlexTreeSchema,
	typeSet: AllowedTypeSet,
): ReadonlySet<FlexTreeNodeSchema> {
	// TODO: Performance: avoid the `Any` case being frequent, possibly with caching in the caller of `getPossibleChildTypes`.
	return typeSet === Any ? new Set(schemaData.nodeSchema.values()) : typeSet;
}

/**
 * @returns all types, for which the data is schema-compatible.
 */
export function getPossibleTypes(
	context: FlexTreeSchema,
	typeSet: AllowedTypeSet,
	data: ContextuallyTypedNodeData,
): FlexTreeNodeSchema[] {
	// All types allowed by schema
	const allowedTypes = getAllowedTypes(context, typeSet);

	const possibleTypes: FlexTreeNodeSchema[] = [];
	for (const allowed of allowedTypes) {
		if (shallowCompatibilityTest(allowed, data)) {
			possibleTypes.push(allowed);
		}
	}
	return possibleTypes;
}

/**
 * A symbol used to define a {@link MarkedArrayLike} interface.
 * @internal
 */
export const arrayLikeMarkerSymbol: unique symbol = Symbol("flex-tree:arrayLikeMarker");

/**
 * Can be used to mark a type which works like an array, but is not compatible with `Array.isArray`.
 * @internal
 */
export interface MarkedArrayLike<TGet, TSet extends TGet = TGet>
	extends ArrayLikeMut<TGet, TSet> {
	readonly [arrayLikeMarkerSymbol]: true;
	[Symbol.iterator](): IterableIterator<TGet>;
}

/**
 * Can be used to mark a type which works like an array, but is not compatible with `Array.isArray`.
 * @internal
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
 * @internal
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
 * @internal
 */
export type ContextuallyTypedNodeData =
	| ContextuallyTypedNodeDataObject
	| number
	| string
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| readonly ContextuallyTypedNodeData[]
	| MarkedArrayLike<ContextuallyTypedNodeData>;

/**
 * Content of a field which needs external schema information to interpret.
 *
 * This format is intended for concise authoring of tree literals when the schema is statically known.
 *
 * Once schema aware APIs are implemented, they can be used to provide schema specific subsets of this type.
 * @internal
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
 * @internal
 */
export function isContextuallyTypedNodeDataObject(
	data: ContextuallyTypedNodeData | undefined,
): data is ContextuallyTypedNodeDataObject {
	return !(isTreeValue(data) || isArrayLike(data));
}

/**
 * Object case of {@link ContextuallyTypedNodeData}.
 * @internal
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
	 * Allow explicit undefined for compatibility with FlexTree, and type-safety on read.
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
	schema: FlexTreeNodeSchema,
	data: ContextuallyTypedNodeData,
): boolean {
	assert(!areCursors(data), 0x6b1 /* cursors cannot be used as contextually typed data. */);
	assert(
		data !== undefined,
		0x6b2 /* undefined cannot be used as contextually typed data. Use ContextuallyTypedFieldData. */,
	);

	if (schema instanceof LeafNodeSchema) {
		// Reject objects with no value from being leaf nodes.
		// Note that if allowing IFluidHandles without wrapping them in a leaf node object,
		// this (or the above isPrimitiveValue) would have to change.

		if (isTreeValue(data)) {
			return allowsValue(schema.leafValue, data);
		}
		if ((data as ContextuallyTypedNodeDataObject)[valueSymbol] === undefined) {
			return false;
		}
	}
	if (isTreeValue(data)) {
		return false;
	}
	if (isArrayLike(data)) {
		if (schema instanceof FlexFieldNodeSchema) {
			const field = schema.getFieldSchema();
			return field.kind.multiplicity === Multiplicity.Sequence;
		} else {
			return false;
		}
	}
	if (data[typeNameSymbol] !== undefined) {
		return data[typeNameSymbol] === schema.name;
	}
	// For now, consider all not explicitly typed objects shallow compatible.
	// This will require explicit differentiation in polymorphic cases rather than automatic structural differentiation.

	return true;
}

/**
 * Construct a tree from ContextuallyTypedNodeData.
 *
 * TODO: this should probably be refactored into a `try` function which either returns a Cursor or a SchemaError with a path to the error.
 * @returns a cursor in Nodes mode for a single node containing the provided data.
 * @internal
 */
export function cursorFromContextualData(
	context: TreeDataContext,
	typeSet: AllowedTypeSet,
	data: ContextuallyTypedNodeData,
): ITreeCursorSynchronous {
	const mapTree = applyTypesFromContext(context, typeSet, data);
	return cursorForMapTreeNode(mapTree);
}

/**
 * Strongly typed {@link cursorFromContextualData} for a TreeNodeSchema.
 * @returns a cursor in Nodes mode for a single node containing the provided data.
 * @internal
 */
export function cursorForTypedTreeData<T extends FlexTreeNodeSchema>(
	context: TreeDataContext,
	schema: T,
	data: InsertableFlexNode<T>,
): ITreeCursorSynchronous {
	return cursorFromContextualData(
		context,
		new Set([schema]),
		data as ContextuallyTypedNodeData,
	);
}

/**
 * Strongly typed {@link cursorFromContextualData} for AllowedTypes.
 * @returns a cursor in Nodes mode for a single node containing the provided data.
 * @internal
 */
export function cursorForTypedData<T extends FlexAllowedTypes>(
	context: TreeDataContext,
	schema: T,
	data: AllowedTypesToFlexInsertableTree<T>,
): ITreeCursorSynchronous {
	return cursorFromContextualData(
		context,
		allowedTypesSchemaSet(schema),
		data as unknown as ContextuallyTypedNodeData,
	);
}

/**
 * Construct a tree from ContextuallyTypedNodeData.
 * Returns a cursor in Field mode.
 *
 * TODO: this should probably be refactored into a `try` function which either returns a Cursor or a SchemaError with a path to the error.
 */
export function cursorsFromContextualData(
	context: TreeDataContext,
	field: FlexFieldSchema,
	data: ContextuallyTypedNodeData | undefined,
): ITreeCursorSynchronous {
	const mapTrees = applyFieldTypesFromContext(context, field, data);
	return cursorForMapTreeField(mapTrees);
}

/**
 * Strongly typed {@link cursorsFromContextualData} for a TreeFieldSchema
 * @internal
 */
export function cursorsForTypedFieldData<T extends FlexFieldSchema>(
	context: TreeDataContext,
	schema: T,
	data: InsertableFlexField<T>,
): ITreeCursorSynchronous {
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
	typeSet: AllowedTypeSet,
	data: ContextuallyTypedNodeData,
): MapTree {
	const possibleTypes: FlexTreeNodeSchema[] = getPossibleTypes(context.schema, typeSet, data);

	assert(
		possibleTypes.length !== 0,
		0x4d4 /* data incompatible with all types allowed by the schema */,
	);
	assert(
		possibleTypes.length === 1,
		0x4d5 /* data compatible with more than one type allowed by the schema */,
	);

	const schema = possibleTypes[0];

	if (schema instanceof LeafNodeSchema) {
		const value = isTreeValue(data)
			? data
			: (data as ContextuallyTypedNodeDataObject)[valueSymbol];

		assert(
			allowsValue(schema.leafValue, value),
			0x4d3 /* unsupported schema for provided primitive */,
		);
		return { value, type: schema.name, fields: new Map() };
	}
	assert(!isTreeValue(data), 0x880 /* leaf value for non leaf */);
	if (schema instanceof FlexFieldNodeSchema) {
		if (isArrayLike(data)) {
			const children = applyFieldTypesFromContext(context, schema.getFieldSchema(), data);
			return {
				value: undefined,
				type: schema.name,
				fields: new Map(children.length > 0 ? [[EmptyKey, children]] : []),
			};
		}
	}
	assert(!isArrayLike(data), 0x881 /* array for non field node */);
	if (
		schema instanceof FlexMapNodeSchema ||
		schema instanceof FlexObjectNodeSchema ||
		schema instanceof FlexFieldNodeSchema
	) {
		const fields: Map<FieldKey, MapTree[]> = new Map();
		for (const key of fieldKeysFromData(data)) {
			assert(!fields.has(key), 0x6b3 /* Keys should not be duplicated */);
			const childSchema = schema.getFieldSchema(key);
			const children = applyFieldTypesFromContext(context, childSchema, data[key]);

			if (children.length > 0) {
				fields.set(key, children);
			}
		}

		if (schema instanceof FlexObjectNodeSchema) {
			for (const key of schema.objectNodeFields.keys()) {
				if (data[key] === undefined) {
					setFieldForKey(key, context, schema, fields);
				}
			}
		}

		const value = data[valueSymbol];
		assert(value === undefined, 0x4d7 /* provided value not permitted by the schema */);
		return { value, type: schema.name, fields };
	} else {
		fail("unexpected node kind");
	}
}

function setFieldForKey(
	key: FieldKey,
	context: TreeDataContext,
	schema: FlexTreeNodeSchema,
	fields: Map<FieldKey, MapTree[]>,
): void {
	const requiredFieldSchema = schema.getFieldSchema(key);
	const multiplicity = getFieldKind(requiredFieldSchema).multiplicity;
	if (multiplicity === Multiplicity.Single && context.fieldSource !== undefined) {
		const fieldGenerator = context.fieldSource(key, requiredFieldSchema.stored);
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
	field: FlexFieldSchema,
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
			applyTypesFromContext(context, field.allowedTypeSet, child),
		);
		return children;
	}
	assert(
		multiplicity === Multiplicity.Single || multiplicity === Multiplicity.Optional,
		0x4da /* single value provided for an unsupported field */,
	);
	return [applyTypesFromContext(context, field.allowedTypeSet, data)];
}

/**
 * Content to use for a field.
 *
 * When used, this content will be deeply copied into the tree, and must comply with the schema.
 *
 * The content must follow the {@link Multiplicity} of the {@link FlexFieldKind}:
 * - use a single cursor for an `optional` or `value` field;
 * - use array of cursors for a `sequence` field;
 *
 * TODO: this should allow a field cursor instead of an array of cursors.
 * TODO: Make this generic so a variant of this type that allows placeholders for detached sequences to consume.
 * @internal
 */
export type NewFieldContent =
	| ITreeCursorSynchronous
	| readonly ITreeCursorSynchronous[]
	| ContextuallyTypedFieldData;

/**
 * Convert NewFieldContent into ITreeCursorSynchronous.
 * The returned cursor will be in Field mode.
 */
export function normalizeNewFieldContent(
	context: TreeDataContext,
	schema: FlexFieldSchema,
	content: NewFieldContent,
): ITreeCursorSynchronous {
	if (areCursors(content)) {
		if (isReadonlyArray(content)) {
			assert(
				getFieldKind(schema).multiplicity === Multiplicity.Sequence || content.length === 1,
				0x6b8 /* non-sequence fields can not be provided content that is multiple cursors */,
			);
			// TODO: is there a better way to get a field cursor from an array of node cursors?
			const mapTrees = content.map((c) => mapTreeFromCursor(c));
			return cursorForMapTreeField(mapTrees);
		}
		if (content.mode === CursorLocationType.Fields) {
			return content;
		}
		// TODO: is there a better way to get a field cursor from a node cursor?
		return cursorForMapTreeField([mapTreeFromCursor(content)]);
	}

	return cursorsFromContextualData(context, schema, content);
}
