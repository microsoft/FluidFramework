/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { fail, isReadonlyArray } from "../util";
import {
	EmptyKey,
	FieldKey,
	Value,
	TreeStoredSchema,
	ValueSchema,
	FieldStoredSchema,
	TreeSchemaIdentifier,
	TreeTypeSet,
	MapTree,
	ITreeCursorSynchronous,
	SchemaData,
	TreeValue,
} from "../core";
// TODO:
// This module currently is assuming use of default-field-kinds.
// The field kinds should instead come from a view schema registry thats provided somewhere.
import { fieldKinds } from "./default-field-kinds";
import { FieldKind, Multiplicity } from "./modular-schema";
import { AllowedTypes, FieldSchema, TreeSchema, allowedTypesToTypeSet } from "./typed-schema";
import { singleMapTreeCursor } from "./mapTreeCursor";
import { areCursors, isPrimitive } from "./editable-tree";
import { AllowedTypesToTypedTrees, ApiMode, TypedField, TypedNode } from "./schema-aware";

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
 * @privateRemarks
 * TODO: remove from package API when old editable-tree API is removed
 */
export type PrimitiveValue = string | boolean | number;

/**
 * Checks if a value is a {@link PrimitiveValue}.
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

export function allowsValue(schema: ValueSchema | undefined, nodeValue: Value): boolean {
	if (schema === undefined) {
		return nodeValue === undefined;
	}
	return valueSchemaAllows(schema, nodeValue);
}

export function valueSchemaAllows<TSchema extends ValueSchema>(
	schema: TSchema,
	nodeValue: Value,
): nodeValue is TreeValue<TSchema> {
	switch (schema) {
		case ValueSchema.String:
			return typeof nodeValue === "string";
		case ValueSchema.Number:
			return typeof nodeValue === "number";
		case ValueSchema.Boolean:
			return typeof nodeValue === "boolean";
		case ValueSchema.FluidHandle:
			return isFluidHandle(nodeValue);
		default:
			unreachableCase(schema);
	}
}

/**
 * Use for readonly view of Json compatible data that can also contain IFluidHandles.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 */
export type FluidSerializableReadOnly =
	| IFluidHandle
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| readonly FluidSerializableReadOnly[]
	| { readonly [P in string]?: FluidSerializableReadOnly };

// TODO: replace test in FluidSerializer.encodeValue with this.
export function isFluidHandle(value: undefined | FluidSerializableReadOnly): value is IFluidHandle {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const handle = (value as Partial<IFluidHandle>).IFluidHandle;
	// Regular Json compatible data can have fields named "IFluidHandle" (especially if field names come from user data).
	// Separate this case from actual Fluid handles by checking for a circular reference: Json data can't have this circular reference so it is a safe way to detect IFluidHandles.
	const isHandle = handle === value;
	// Since the requirement for this reference to be cyclic isn't particularly clear in the interface (typescript can't model that very well)
	// do an extra test.
	// Since json compatible data shouldn't have methods, and IFluidHandle requires one, use that as a redundant check:
	const getMember = (value as Partial<IFluidHandle>).get;
	assert(
		(typeof getMember === "function") === isHandle,
		"Fluid handle detection via get method should match detection via IFluidHandle field",
	);
	return isHandle;
}

export function assertAllowedValue(
	value: undefined | FluidSerializableReadOnly,
): asserts value is Value {
	assert(isPrimitiveValue(value) || isFluidHandle(value), "invalid value");
}

/**
 * @returns the key and the schema of the primary field out of the given tree schema.
 *
 * See note on {@link EmptyKey} for what is a primary field.
 * @alpha
 */
export function getPrimaryField(
	schema: TreeStoredSchema,
): { key: FieldKey; schema: FieldStoredSchema } | undefined {
	// TODO: have a better mechanism for this. See note on EmptyKey.
	const field = schema.structFields.get(EmptyKey);
	if (field === undefined) {
		return undefined;
	}
	return { key: EmptyKey, schema: field };
}

// TODO: this (and most things in this file) should use ViewSchema, and already have the full kind information.
export function getFieldSchema(field: FieldKey, schema: TreeStoredSchema): FieldStoredSchema {
	return schema.structFields.get(field) ?? schema.mapFields ?? FieldSchema.empty;
}

export function getFieldKind(fieldSchema: FieldStoredSchema): FieldKind {
	// TODO:
	// This module currently is assuming use of defaultFieldKinds.
	// The field kinds should instead come from a view schema registry thats provided somewhere.
	return fieldKinds.get(fieldSchema.kind.identifier) ?? fail("missing field kind");
}

/**
 * @returns all allowed child types for `typeSet`.
 */
export function getAllowedTypes(
	schemaData: SchemaData,
	typeSet: TreeTypeSet,
): ReadonlySet<TreeSchemaIdentifier> {
	// TODO: Performance: avoid the `undefined` case being frequent, possibly with caching in the caller of `getPossibleChildTypes`.
	return typeSet ?? new Set(schemaData.treeSchema.keys());
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

	const possibleTypes: TreeSchemaIdentifier[] = [];
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
 * Information needed to interpret a subtree described by {@link ContextuallyTypedNodeData} and {@link ContextuallyTypedFieldData}.
 * @alpha
 * TODO:
 * Currently being exposed at the package level which also requires us to export MapTree at the package level.
 * Refactor the FieldGenerator to use JsonableTree instead of MapTree, and convert them internally.
 */
export interface TreeDataContext {
	/**
	 * Schema for the document which the tree will be used in.
	 */
	readonly schema: SchemaData;

	/**
	 * Procedural data generator for fields.
	 * Fields which provide generators here can be omitted in the input contextually typed data.
	 *
	 * @remarks
	 * TODO:
	 * For implementers of this which are not pure (like identifier generation),
	 * order of invocation should be made consistent and documented.
	 * This will be important for identifier elision optimizations in tree encoding for session based identifier generation.
	 */
	fieldSource?(key: FieldKey, schema: FieldStoredSchema): undefined | FieldGenerator;
}

/**
 * Generates field content for a MapTree on demand.
 * @alpha
 * TODO:
 * Currently being exposed at the package level which also requires us to export MapTree at the package level.
 * Refactor the FieldGenerator to use JsonableTree instead of MapTree, and convert them internally.
 */
export type FieldGenerator = () => MapTree[];

/**
 * Checks the type of a `ContextuallyTypedNodeData`.
 */
export function isArrayLike(
	data: ContextuallyTypedFieldData,
): data is
	| readonly ContextuallyTypedNodeData[]
	| ReadonlyMarkedArrayLike<ContextuallyTypedNodeData> {
	if (typeof data !== "object") {
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
	schemaData: SchemaData,
	type: TreeSchemaIdentifier,
	data: ContextuallyTypedNodeData,
): boolean {
	assert(!areCursors(data), 0x6b1 /* cursors cannot be used as contextually typed data. */);
	assert(
		data !== undefined,
		0x6b2 /* undefined cannot be used as contextually typed data. Use ContextuallyTypedFieldData. */,
	);
	const schema =
		schemaData.treeSchema.get(type) ?? fail("requested type does not exist in schema");
	if (isPrimitiveValue(data)) {
		return isPrimitive(schema) && allowsValue(schema.leafValue, data);
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
 * @alpha
 */
export function cursorFromContextualData(
	context: TreeDataContext,
	typeSet: TreeTypeSet,
	data: ContextuallyTypedNodeData,
): ITreeCursorSynchronous {
	const mapTree = applyTypesFromContext(context, typeSet, data);
	return singleMapTreeCursor(mapTree);
}

/**
 * Strongly typed {@link cursorFromContextualData} for a TreeSchema
 * @alpha
 */
export function cursorForTypedTreeData<T extends TreeSchema>(
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
	field: FieldStoredSchema,
	data: ContextuallyTypedNodeData | undefined,
): ITreeCursorSynchronous[] {
	const mapTrees = applyFieldTypesFromContext(context, field, data);
	return mapTrees.map(singleMapTreeCursor);
}

/**
 * Strongly typed {@link cursorsFromContextualData} for a FieldSchema
 * @alpha
 */
export function cursorsForTypedFieldData<T extends FieldSchema>(
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
	const possibleTypes: TreeSchemaIdentifier[] = getPossibleTypes(context, typeSet, data);

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
		context.schema.treeSchema.get(type) ?? fail("requested type does not exist in schema");

	if (isPrimitiveValue(data)) {
		// This check avoids returning an out of schema node
		// in the case where schema permits the value, but has required fields.
		assert(
			isPrimitive(schema),
			0x5c3 /* Schema must be primitive when providing a primitive value */,
		);
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

		for (const key of schema.structFields.keys()) {
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
	schema: TreeStoredSchema,
	fields: Map<FieldKey, MapTree[]>,
): void {
	const requiredFieldSchema = getFieldSchema(key, schema);
	const multiplicity = getFieldKind(requiredFieldSchema).multiplicity;
	if (multiplicity === Multiplicity.Value && context.fieldSource !== undefined) {
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
	field: FieldStoredSchema,
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
		multiplicity === Multiplicity.Value || multiplicity === Multiplicity.Optional,
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
	schema: FieldStoredSchema,
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
