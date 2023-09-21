/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import {
	Adapters,
	EmptyKey,
	FieldKey,
	TreeSchemaIdentifier,
	TreeTypeSet,
	ValueSchema,
} from "../../core";
import {
	MakeNominal,
	Assume,
	RestrictiveReadonlyRecord,
	_InlineTrick,
	FlattenKeys,
	Named,
	requireAssignableTo,
} from "../../util";
import { FieldKindTypes, FieldKinds } from "../default-field-kinds";
import { FullSchemaPolicy } from "../modular-schema";
import { LazyItem, normalizeFlexList } from "./flexList";
import { ObjectToMap, WithDefault, objectToMapTyped } from "./typeUtils";

// TODO: tests for this file

/**
 * @alpha
 */
export interface Fields {
	readonly [key: string]: FieldSchema;
}

/**
 * @alpha
 */
export type NormalizeStructFieldsInner<T extends Fields> = {
	[Property in keyof T]: NormalizeField<T[Property]>;
};

/**
 * @alpha
 */
export type NormalizeStructFields<T extends Fields | undefined> = NormalizeStructFieldsInner<
	WithDefault<T, Record<string, never>>
>;

/**
 * Placeholder for to `TreeSchema` to use in constraints where `TreeSchema` is desired but using it causes
 * recursive types to fail to compile due to TypeScript limitations.
 *
 * Using `TreeSchema` instead in some key "extends" clauses cause recursive types to error with:
 * "'theSchema' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer."
 *
 * TODO: how much more specific of a type can be provided without triggering the above error?
 * @alpha
 */
export type RecursiveTreeSchema = unknown;

/**
 * Placeholder for to `TreeSchemaSpecification` to use in constraints where `TreeSchemaSpecification` is desired but using it causes
 * recursive types to fail to compile due to TypeScript limitations.
 *
 * See `RecursiveTreeSchema`.
 *
 * TODO: how much more specific of a type can be provided without triggering the above error?
 * @alpha
 */
export type RecursiveTreeSchemaSpecification = unknown;

{
	type _check1 = requireAssignableTo<TreeSchemaSpecification, RecursiveTreeSchemaSpecification>;
	type _check2 = requireAssignableTo<TreeSchema, RecursiveTreeSchema>;
}

/**
 * T must extend TreeSchemaSpecification.
 * This can not be enforced using TypeScript since doing so breaks recursive type support.
 * See note on SchemaBuilder.fieldRecursive.
 * @alpha
 */
export class TreeSchema<
	Name extends string = string,
	T extends RecursiveTreeSchemaSpecification = TreeSchemaSpecification,
> {
	// Allows reading fields through the normal map, but without losing type information.
	public readonly structFields: ObjectToMap<
		NormalizeStructFields<Assume<T, TreeSchemaSpecification>["structFields"]>,
		FieldKey,
		FieldSchema
	>;

	public readonly structFieldsObject: NormalizeStructFields<
		Assume<T, TreeSchemaSpecification>["structFields"]
	>;

	public readonly mapFields: WithDefault<
		Assume<T, TreeSchemaSpecification>["mapFields"],
		undefined
	>;
	// WithDefault is needed to convert unknown to undefined here (missing properties show up as unknown in types).
	public readonly leafValue: WithDefault<
		Assume<T, TreeSchemaSpecification>["leafValue"],
		undefined
	>;

	public readonly name: Name & TreeSchemaIdentifier;

	public readonly info: Assume<T, TreeSchemaSpecification>;

	public constructor(public readonly builder: Named<string>, name: Name, info: T) {
		this.info = info as Assume<T, TreeSchemaSpecification>;
		this.name = name as Name & TreeSchemaIdentifier;
		this.structFieldsObject = normalizeStructFields<
			Assume<T, TreeSchemaSpecification>["structFields"]
		>(this.info.structFields);
		this.structFields = objectToMapTyped(this.structFieldsObject);
		this.mapFields = this.info.mapFields as WithDefault<
			Assume<T, TreeSchemaSpecification>["mapFields"],
			undefined
		>;
		this.leafValue = this.info.leafValue as WithDefault<
			Assume<T, TreeSchemaSpecification>["leafValue"],
			undefined
		>;
	}
}

// TODO: TreeSchema should be a union of the more specific schema type below, rather than containing all the info for all of them.
// When this change is made, FieldNodeSchema should be properly separated from StructSchema,
// and the bellow type checks could be done with instanceof tests.

/**
 * @alpha
 */
export type MapSchema = TreeSchema & MapSchemaSpecification;
/**
 * @alpha
 */
export type LeafSchema = TreeSchema & LeafSchemaSpecification;

/**
 * TODO: this includes FieldNodeSchema when it shouldn't
 * @alpha
 */
export type StructSchema = TreeSchema & {
	[P in keyof (MapSchemaSpecification & LeafSchemaSpecification)]?: undefined;
};

/**
 * @alpha
 *
 * This is the subset of StructSchema that uses {@link EmptyKey} so the the old (editable-tree 1) API unboxes it.
 * TODO: Once that API is removed, this can be cleaned up and properly separated from StructSchema
 */
export type FieldNodeSchema = StructSchema & {
	/**
	 * The fields of this node.
	 * Only uses the {@link EmptyKey}.
	 *
	 * TODO: this extra indirection will be removed when refactoring TreeSchema (see other related TODOs for details).
	 */
	structFieldsObject: {
		/**
		 * The field this node wraps.
		 * It is under the {@link EmptyKey}.
		 */
		[""]: FieldSchema;
	};
};

export function schemaIsMap(schema: TreeSchema): schema is MapSchema {
	return schema.mapFields !== undefined;
}

export function schemaIsLeaf(schema: TreeSchema): schema is LeafSchema {
	return schema.leafValue !== undefined;
}

export function schemaIsFieldNode(schema: TreeSchema): schema is FieldNodeSchema {
	return schema.structFields.size === 1 && schema.structFields.has(EmptyKey);
}

export function schemaIsStruct(schema: TreeSchema): schema is StructSchema {
	return !schemaIsMap(schema) && !schemaIsLeaf(schema) && !schemaIsFieldNode(schema);
}

/**
 * Convert FieldSchemaSpecification | undefined into FieldSchema.
 * @alpha
 */
export type NormalizeField<T extends FieldSchema | undefined> = T extends FieldSchema
	? T
	: FieldSchema<typeof FieldKinds.forbidden, []>;

function normalizeStructFields<T extends Fields | undefined>(fields: T): NormalizeStructFields<T> {
	if (fields === undefined) {
		return {} as unknown as NormalizeStructFields<T>;
	}
	const out: Record<string, FieldSchema> = {};
	// eslint-disable-next-line no-restricted-syntax
	for (const key in fields) {
		if (Object.prototype.hasOwnProperty.call(fields, key)) {
			const element = fields[key];
			out[key] = normalizeField(element);
		}
	}
	return out as NormalizeStructFields<T>;
}

function normalizeField<T extends FieldSchema | undefined>(t: T): NormalizeField<T> {
	if (t === undefined) {
		return FieldSchema.empty as unknown as NormalizeField<T>;
	}

	assert(t instanceof FieldSchema, 0x6ae /* invalid FieldSchema */);
	return t as NormalizeField<T>;
}

/**
 * Allow any node (as long as it meets the schema for its own type).
 * @alpha
 */
export const Any = "Any" as const;
/**
 * Allow any node (as long as it meets the schema for its own type).
 * @alpha
 */
export type Any = typeof Any;

/**
 * Tree type, but can be wrapped in a function to allow referring to types before they are declared.
 * This makes recursive and co-recursive types possible.
 * @alpha
 */
export type LazyTreeSchema = TreeSchema | (() => TreeSchema);

/**
 * Types for use in fields.
 *
 * "Any" is boxed in an array to allow use as variadic parameter.
 * @alpha
 */
export type AllowedTypes = [Any] | readonly LazyItem<TreeSchema>[];

/**
 * Checks if an {@link AllowedTypes} is {@link (Any:type)}.
 * @alpha
 */
export function allowedTypesIsAny(t: AllowedTypes): t is [Any] {
	return t.length === 1 && t[0] === Any;
}

/**
 * `TreeSchemaSpecification` for {@link SchemaBuilder.struct}.
 * @alpha
 */
export interface StructSchemaSpecification {
	readonly structFields: RestrictiveReadonlyRecord<string, FieldSchema>;
}

/**
 * `TreeSchemaSpecification` for {@link SchemaBuilder.map}.
 * @alpha
 */
export interface MapSchemaSpecification {
	readonly mapFields: MapFieldSchema;
}

/**
 * Subset of FieldSchema thats legal in maps.
 * This requires empty to be a valid value for the map.
 * @alpha
 */
export type MapFieldSchema = FieldSchema<typeof FieldKinds.optional | typeof FieldKinds.sequence>;

/**
 * `TreeSchemaSpecification` for {@link SchemaBuilder.leaf}.
 * @alpha
 */
export interface LeafSchemaSpecification {
	readonly leafValue: ValueSchema;
}

/**
 * Object for capturing information about a TreeStoredSchema for use at both compile time and runtime.
 * @alpha
 */
export type TreeSchemaSpecification = [
	FlattenKeys<
		(StructSchemaSpecification | MapSchemaSpecification | LeafSchemaSpecification) &
			Partial<StructSchemaSpecification & MapSchemaSpecification & LeafSchemaSpecification>
	>,
][_InlineTrick];

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @sealed @alpha
 */
export class FieldSchema<Kind extends FieldKindTypes = FieldKindTypes, Types = AllowedTypes> {
	/**
	 * Schema for a field which must always be empty.
	 */
	public static readonly empty = new FieldSchema(FieldKinds.forbidden, []);

	protected _typeCheck?: MakeNominal;

	/**
	 * @param kind - The [kind](https://en.wikipedia.org/wiki/Kind_(type_theory)) of this field.
	 * Determine the multiplicity, viewing and editing APIs as well as the merge resolution policy.
	 * @param allowedTypes - What types of tree nodes are allowed in this field.
	 */
	public constructor(public readonly kind: Kind, public readonly allowedTypes: Types) {}

	public get types(): TreeTypeSet {
		return allowedTypesToTypeSet(this.allowedTypes as unknown as AllowedTypes);
	}
}

// TODO: maybe remove the need for this here? Just use AllowedTypes in view schema?
/**
 * Convert {@link AllowedTypes} to {@link TreeTypeSet}.
 * @alpha
 */
export function allowedTypesToTypeSet(t: AllowedTypes): TreeTypeSet {
	if (allowedTypesIsAny(t)) {
		return undefined;
	}
	const list: readonly (() => TreeSchema)[] = normalizeFlexList(t);
	const names = list.map((f) => f().name);
	return new Set(names);
}

/**
 * Schema data that can be be used to view a document.
 * Strongly typed over its rootFieldSchema.
 *
 * @remarks
 * This type is mainly used as a type constraint to mean that the code working with it requires strongly typed schema.
 * The actual type used will include detailed schema information for all the types in the collection.
 * This pattern is used to implement SchemaAware APIs.
 *
 * @alpha
 */

export interface TypedSchemaCollection<T extends FieldSchema = FieldSchema> {
	readonly rootFieldSchema: T;
	readonly treeSchema: ReadonlyMap<TreeSchemaIdentifier, TreeSchema>;
	readonly policy: FullSchemaPolicy;
	readonly adapters: Adapters;
}
