/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { UntypedTreeCore } from "../../untypedTree";
import { IFieldSchema, ITreeSchema } from "../view";
import { contextSymbol, typeSymbol } from "../../editable-tree";
import {
	GlobalFieldKey,
	GlobalFieldKeySymbol,
	LocalFieldKey,
	Named,
	TreeSchemaIdentifier,
	TreeTypeSet,
	ValueSchema,
} from "../../../core";
import { FieldKinds } from "../..";
import { forbidden, value } from "../../defaultFieldKinds";
import { MakeNominal, brand } from "../../../util";
import { FlexList, FlexListToLazyArray, normalizeFlexList } from "./flexList";
import { ObjectToMap, WithDefault, objectToMap } from "./typeUtils";

// TODO: tests for this file

interface LocalFields {
	readonly [key: string]: FieldSchemaSpecification | undefined;
}

type NormalizeLocalFieldsInner<T extends LocalFields> = ObjectToMap<
	{ [Property in keyof T]: NormalizeField<T[Property]> },
	LocalFieldKey,
	FieldSchema
>;

type NormalizeLocalFields<T extends LocalFields | undefined> = NormalizeLocalFieldsInner<
	WithDefault<T, Record<string, never>>
>;

export class TreeSchema<T extends TypedTreeSchemaSpecification = any> implements ITreeSchema {
	// Allows reading localFields through the normal map, but without losing type information.
	public readonly localFields: NormalizeLocalFields<T["local"]>;

	public readonly globalFields!: ReadonlySet<GlobalFieldKey>;
	public readonly extraLocalFields: FieldSchema;
	public readonly extraGlobalFields: boolean;
	public readonly value: ValueSchema;

	public readonly name: TreeSchemaIdentifier;

	public constructor(
		public readonly builder: Named<string>,
		name: string,
		public readonly info: T,
	) {
		this.name = brand(name);
		this.localFields = normalizeLocalFields<T["local"]>(builder, info.local);
		this.extraLocalFields = normalizeField(builder, info.extraLocalFields);
		this.extraGlobalFields = info.extraGlobalFields ?? false;
		this.value = info.value ?? ValueSchema.Nothing;
	}

	public downCast(tree: UntypedTreeCore): tree is TypedTree<T> {
		const contextSchema = tree[contextSymbol].schema;
		const lookedUp = contextSchema.treeSchema.get(this.name);
		// TODO: for this to pass, schematized view must have the view schema, not just stored schema.
		assert(lookedUp === this, "cannot downcase to a schema the tree is not using");

		// TODO: make this actually work
		const matches = tree[typeSymbol] === this;
		assert(
			matches === (tree[typeSymbol].name === this.name),
			"schema object identity comparison should match identifier comparison",
		);
		return matches;
	}
}

/**
 * Convert FieldSchemaSpecification | undefined into FieldSchema
 */
type NormalizeField<T extends FieldSchemaSpecification | undefined> = FieldSchema<
	T extends undefined ? typeof forbidden : T extends FieldSchema<infer Kind> ? Kind : typeof value
>;

function normalizeLocalFields<T extends LocalFields | undefined>(
	builder: Named<string>,
	fields: T,
): NormalizeLocalFields<T> {
	if (fields === undefined) {
		return new Map();
	}
	const out: Record<string, FieldSchema> = {};
	// eslint-disable-next-line no-restricted-syntax
	for (const key in fields) {
		if (Object.prototype.hasOwnProperty.call(fields, key)) {
			const element = fields[key];
			out[key] = normalizeField(builder, element);
		}
	}
	const map = objectToMap(out);
	return map as NormalizeLocalFields<T>;
}

function normalizeField<T extends FieldSchemaSpecification | undefined>(
	builder: Named<string>,
	t: T,
): NormalizeField<T> {
	if (t instanceof FieldSchema) {
		return t as NormalizeField<T>;
	}
	if (t === undefined) {
		return new FieldSchema(builder, forbidden, []) as unknown as NormalizeField<T>;
	}
	return new FieldSchema(builder, value, t) as NormalizeField<T>;
}

// TODO: maybe remove the need for this here? Just use AllowedTypes in view schema?
function allowedTypesToTypeSet(t: AllowedTypes): TreeTypeSet {
	const normalized = normalizeAllowedTypes(t);
	if (Array.isArray(normalized)) {
		// TODO: don't remove laziness here.
		return new Set(normalized.map((lazy) => lazy().name));
	}
	assert(normalized === Any, "invalid AllowedTypes");
	return undefined;
}

type TypedTree<_T> = UntypedTreeCore & { todo: "add stuff" };

export const Any = "Any" as const;
export type Any = typeof Any;

/**
 * Tree type, but can be wrapped in a function to allow referring to types before they are declared.
 * This makes recursive and co-recursive types possible.
 */
export type LazyTreeSchema = TreeSchema | (() => TreeSchema);

export type NormalizedAllowedTypes = Any | readonly TreeSchema[];
export type NormalizedLazyAllowedTypes = Any | (() => TreeSchema)[];

/**
 * Types for use in fields.
 */
export type AllowedTypes = Any | FlexList<TreeSchema>;

/**
 * Convert AllowedTypes into NormalizedLazyAllowedTypes
 */
type NormalizeAllowedTypes<T extends AllowedTypes> = T extends Any
	? Any
	: FlexListToLazyArray<TreeSchema, T>;

export function normalizeAllowedTypes<T extends AllowedTypes>(t: T): NormalizeAllowedTypes<T> {
	if (t === Any) {
		return Any as NormalizeAllowedTypes<T>;
	}
	return normalizeFlexList(t) as NormalizeAllowedTypes<T>;
}

type FieldSchemaSpecification = AllowedTypes | FieldSchema;

/**
 * Object for capturing information about a TreeStoredSchema for use at both compile time and runtime.
 * @alpha
 */
export interface TypedTreeSchemaSpecification {
	readonly local?: { readonly [key: string]: FieldSchemaSpecification | undefined };
	readonly global?: FlexList<GlobalFieldSchema>;
	readonly extraLocalFields?: FieldSchemaSpecification;
	readonly extraGlobalFields?: boolean;
	readonly value?: ValueSchema;
}

export type Kinds = typeof FieldKinds[keyof typeof FieldKinds] | typeof forbidden;

/**
 * All policy for a specific field,
 * including functionality that does not have to be kept consistent across versions or deterministic.
 *
 * This can include policy for how to use this schema for "view" purposes, and well as how to expose editing APIs.
 * @sealed @alpha
 */
export class FieldSchema<Kind extends Kinds = Kinds, Types extends AllowedTypes = AllowedTypes>
	implements IFieldSchema
{
	protected typeCheck!: MakeNominal;
	public constructor(
		public readonly builder: Named<string>,
		public readonly kind: Kind,
		public readonly allowedTypes: Types,
	) {}

	public get types(): TreeTypeSet {
		return allowedTypesToTypeSet(this.allowedTypes);
	}
}

export interface GlobalFieldSchema<
	Kind extends Kinds = Kinds,
	Types extends AllowedTypes = AllowedTypes,
> extends Named<GlobalFieldKeySymbol> {
	readonly builder: Named<string>;
	readonly schema: FieldSchema<Kind, Types>;
}
