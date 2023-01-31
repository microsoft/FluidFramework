/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { brand, fail } from "../../util";
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
} from "../../core";
// TODO:
// This module currently is assuming use of defaultFieldKinds.
// The field kinds should instead come from a view schema registry thats provided somewhere.
import { fieldKinds } from "../defaultFieldKinds";
import { FieldKind, Multiplicity } from "../modular-schema";
import { typeNameSymbol, valueSymbol } from "./editableTree";

/**
 * @returns true iff `schema` trees should default to being viewed as just their value when possible.
 *
 * Note that this may return true for some types which can not be unwrapped to just their value,
 * since EditableTree avoids ever unwrapping primitives that are objects
 * so users checking for primitives by type won't be broken.
 * Checking for this object case is done elsewhere.
 * @alpha
 */
export function isPrimitive(schema: TreeSchema): boolean {
	// TODO: use a separate `TreeViewSchema` type, with metadata that determines if the type is primitive.
	// Since the above is not done yet, use use a heuristic:
	return (
		schema.value !== ValueSchema.Nothing &&
		schema.localFields.size === 0 &&
		schema.globalFields.size === 0
	);
}

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

export function allowsPrimitiveValueType(nodeValue: Value, schema: TreeSchema): boolean {
	if (!isPrimitiveValue(nodeValue)) {
		return false;
	}
	switch (schema.value) {
		case ValueSchema.String:
			return typeof nodeValue === "string";
		case ValueSchema.Number:
			return typeof nodeValue === "number";
		case ValueSchema.Boolean:
			return typeof nodeValue === "boolean";
		default:
			return false;
	}
}

export function assertPrimitiveValueType(nodeValue: Value, schema: TreeSchema): void {
	assert(
		allowsPrimitiveValueType(nodeValue, schema),
		0x4d3 /* unsupported schema for provided primitive */,
	);
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
		return field;
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
	return fieldKinds.get(fieldSchema.kind) ?? fail("missing field kind");
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
 * Variant of ProxyHandler covering when the type of the target and implemented interface are different.
 * Only the parts needed so far are included.
 */
export interface AdaptingProxyHandler<T extends object, TImplements extends object> {
	// apply?(target: T, thisArg: any, argArray: any[]): any;
	// construct?(target: T, argArray: any[], newTarget: Function): object;
	// defineProperty?(target: T, p: string | symbol, attributes: PropertyDescriptor): boolean;
	deleteProperty?(target: T, p: string | symbol): boolean;
	get?(target: T, p: string | symbol, receiver: unknown): unknown;
	getOwnPropertyDescriptor?(target: T, p: string | symbol): PropertyDescriptor | undefined;
	// getPrototypeOf?(target: T): object | null;
	has?(target: T, p: string | symbol): boolean;
	// isExtensible?(target: T): boolean;
	ownKeys?(target: T): ArrayLike<keyof TImplements>;
	// preventExtensions?(target: T): boolean;
	set?(target: T, p: string | symbol, value: unknown, receiver: unknown): boolean;
	// setPrototypeOf?(target: T, v: object | null): boolean;
}

export function adaptWithProxy<From extends object, To extends object>(
	target: From,
	proxyHandler: AdaptingProxyHandler<From, To>,
): To {
	// Proxy constructor assumes handler emulates target's interface.
	// Ours does not, so this cast is required.
	return new Proxy<From>(target, proxyHandler as ProxyHandler<From>) as unknown as To;
}

export function getOwnArrayKeys(length: number): string[] {
	return Object.getOwnPropertyNames(Array.from(Array(length)));
}

export function keyIsValidIndex(key: string | number, length: number): boolean {
	const index = Number(key);
	if (typeof key === "string" && String(index) !== key) return false;
	return Number.isInteger(index) && 0 <= index && index < length;
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
export interface MarkedArrayLike<T> extends ArrayLike<T> {
	/**
	 * `ArrayLike` numeric indexed access, but writable.
	 */
	[n: number]: T;
	readonly [arrayLikeMarkerSymbol]: true;
	[Symbol.iterator](): IterableIterator<T>;
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
 * Checks the type of a `ContextuallyTypedNodeData`.
 */
export function isArrayLike(
	data: ContextuallyTypedNodeData | undefined,
): data is readonly ContextuallyTypedNodeData[] | MarkedArrayLike<ContextuallyTypedNodeData> {
	return isWritableArrayLike(data) || Array.isArray(data);
}

/**
 * Checks the type of a `ContextuallyTypedNodeData`.
 * @alpha
 */
export function isWritableArrayLike(
	data: ContextuallyTypedNodeData | undefined,
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
	readonly [typeNameSymbol]?: TreeSchemaIdentifier;
	/**
	 * Fields of this node, indexed by their field keys.
	 *
	 * Allow explicit undefined for compatibility with EditableTree, and type-safety on read.
	 */
	// TODO: make sure explicit undefined is actually handled correctly.
	[key: FieldKey]: ContextuallyTypedNodeData | undefined;
	/**
	 * Fields of this node, indexed by their field keys as strings.
	 *
	 * Allow unbranded local field keys and a convenience for literals.
	 */
	[key: string]: ContextuallyTypedNodeData | undefined;
}

/**
 * Checks if data is schema-compatible.
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
		return allowsPrimitiveValueType(data, schema);
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
	return true;
}

/**
 * Construct a MapTree from ContextuallyTypedNodeData.
 *
 * TODO: this should probably be refactors into a `try` function which either returns a MapTree or a SchemaError with a path to the error.
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
		assertPrimitiveValueType(data, schema);
		return { value: data, type, fields: new Map() };
	} else if (isArrayLike(data)) {
		const primary = getPrimaryField(schema);
		assert(
			primary !== undefined,
			0x4d6 /* array data reported comparable with the schema without a primary field */,
		);
		const children = applyFieldTypesFromContext(schemaData, primary.schema, data);
		const value = allowsValue(schema.value, data) ? data : undefined;
		return { value, type, fields: new Map([[primary.key, children]]) };
	} else {
		const fields: Map<FieldKey, MapTree[]> = new Map(
			Reflect.ownKeys(data)
				.filter((key) => typeof key === "string" || symbolIsFieldKey(key))
				.map((key) => {
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

/**
 * Construct a MapTree from ContextuallyTypedNodeData.
 *
 * TODO: this should probably be refactors into a `try` function which either returns a MapTree or a SchemaError with a path to the error.
 */
export function applyFieldTypesFromContext(
	schemaData: SchemaDataAndPolicy,
	field: FieldSchema,
	data: ContextuallyTypedNodeData | undefined,
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
